"""Contract and conversion tests; no held-out labels or engine subprocesses."""
import unittest
import numpy as np

class Contracts(unittest.TestCase):
    def test_reviewed_official_contract_reference(self):
        import ast,chess,model
        from pathlib import Path
        root=Path(__file__).resolve().parents[2]/'.cache/research'
        # Execute ONLY the two already-reviewed pure reference functions;
        # discard imports/annotations and all unrelated upstream code.
        source=ast.parse((root/'utils.py').read_text())
        fn=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='_compute_all_possible_actions')
        fn.returns=None
        module=ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[]))
        namespace={'chess':chess,'_CHESS_FILE':list('abcdefgh')}
        exec(compile(module,'reviewed-action-reference','exec'),namespace)
        official,_=namespace['_compute_all_possible_actions']()
        self.assertEqual(model.MOVE_TO_ACTION,official)
        source=ast.parse((root/'tokenizer.py').read_text())
        fn=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='tokenize')
        fn.returns=None
        for arg in fn.args.args: arg.annotation=None
        namespace={'np':np,'_CHARACTERS_INDEX':model.CHAR_INDEX,
                   '_SPACES_CHARACTERS':frozenset('12345678'),'SEQUENCE_LENGTH':77}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[])),'reviewed-tokenizer-reference','exec'),namespace)
        fens=[chess.STARTING_FEN,'4k3/8/8/8/8/8/8/4K3 b - - 99 999',
              'r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 12 234']
        for fen in fens: np.testing.assert_array_equal(model.tokenize(fen),namespace['tokenize'](fen))

    def test_absolute_fen_and_actions(self):
        import model
        import chess
        self.assertTrue(hasattr(model, 'tokenize'), 'exact tokenizer is not implemented')
        fen = chess.STARTING_FEN
        expected = 'w' + 'rnbqkbnrpppppppp' + '.'*32 + 'PPPPPPPPRNBQKBNR' + 'KQkq' + '..' + '0..1..'
        chars = '0123456789abcdefghpnrkqPBNRQKw.'
        np.testing.assert_array_equal(model.tokenize(fen), [chars.index(c) for c in expected])
        self.assertEqual(len(model.MOVE_TO_ACTION),1968)
        self.assertEqual(len(set(model.ACTION_TO_MOVE)),1968)
        for uci in ['e1g1','e8c8','e2e4','a7a8q','a2b1n']:
            self.assertEqual(model.ACTION_TO_MOVE[model.move_index(uci)],uci)
        f='8/8/8/8/8/8/8/8 b - e3 12 234'
        self.assertEqual(model.tokenize(f)[0],chars.index('b'))
        self.assertEqual(model.tokenize(f)[-8:].tolist(),[chars.index(c) for c in 'e312.234'])

class ImportTests(unittest.TestCase):
    def test_features_legal_selection_and_safe_roundtrip(self):
        import model,torch,chess
        self.assertTrue(hasattr(model.DeepMind9M,'forward_features'),'cached encoder API is missing')
        from pathlib import Path
        import tempfile
        torch.set_num_threads(1)
        root=Path(__file__).resolve().parents[2]
        m,report=model.load_official(root/'.cache/research/weights/9M_behavioral_cloning',semantics=model.Semantics(1e-6,16.0))
        tokens=model.encode_fens([chess.STARTING_FEN])
        with torch.no_grad():
            features=m.forward_features(tokens)
            self.assertEqual(tuple(features.shape),(1,256))
            torch.testing.assert_close(m(tokens),m.head(features),rtol=0,atol=0)
            self.assertEqual(tuple(m(tokens).shape),(1,1968))
            board=chess.Board()
            ranked=model.rank_legal(m,board)
            self.assertEqual(len(ranked),20)
            self.assertTrue(all(chess.Move.from_uci(x['move']) in board.legal_moves for x in ranked))
            self.assertAlmostEqual(sum(x['probability'] for x in ranked),1.,places=6)
            self.assertEqual(model.rank_legal(m,chess.Board('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1')),[])
        # No optimizer steps: prove the API remains differentiable without training.
        m.zero_grad(set_to_none=True)
        m(tokens).square().mean().backward()
        self.assertTrue(torch.isfinite(m.token_embedding.weight.grad).all().item())
        self.assertGreater(m.head.weight.grad.abs().sum().item(),0)
        with tempfile.TemporaryDirectory(dir=root/'.cache') as d:
            path=Path(d)/'candidate.pt'
            model.save_converted(m,path,report)
            with self.assertRaisesRegex(ValueError,'experimental'):
                model.load_converted(path)
            restored,metadata=model.load_converted(path,allow_experimental=True)
            with torch.no_grad(): torch.testing.assert_close(m(tokens),restored(tokens),rtol=0,atol=0)
            self.assertFalse(metadata['official_semantics_verified'])
        with self.assertRaises(ValueError): m(tokens[:,:77])

    def test_strict_import_and_numpy_parity(self):
        import model
        self.assertTrue(hasattr(model, 'load_official'), 'safe checkpoint importer is missing')
        import torch
        from pathlib import Path
        torch.set_num_threads(1)
        checkpoint = Path(__file__).resolve().parents[2]/'.cache/research/weights/9M_behavioral_cloning'
        with self.assertRaisesRegex(ValueError, 'semantic'):
            model.load_official(checkpoint)
        semantics = model.Semantics(layer_norm_eps=1e-6, embedding_scale=16.0)
        net, report = model.load_official(checkpoint, semantics=semantics)
        self.assertEqual(report['parameter_count'], 8930992)
        self.assertEqual(report['tensor_count'], 94)
        self.assertEqual(sum(p.numel() for p in net.parameters()),8930992)
        self.assertFalse(report['official_semantics_verified'])
        fens = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
                '4k3/P7/8/8/8/8/7p/4K3 b - - 12 234']
        tokens = model.encode_fens(fens)
        self.assertEqual(tuple(tokens.shape),(3,78))
        with torch.no_grad(): actual, traces = net(tokens, return_all=True, return_trace=True)
        reference, reftraces = numpy_reference(checkpoint,tokens.numpy(),semantics)
        # fp32 residual streams reach magnitude 10,000; test float64 traces
        # strictly, then test the production fp32 output directly.
        with torch.no_grad(): double_logits, double_traces = net.double()(tokens,return_all=True,return_trace=True)
        for key in reftraces:
            np.testing.assert_allclose(double_traces[key].numpy(),reftraces[key],atol=1e-8,rtol=1e-10,err_msg=key)
        np.testing.assert_allclose(double_logits.numpy(),reference,atol=1e-9,rtol=1e-10)
        np.testing.assert_allclose(actual.numpy(),reference,atol=1e-3,rtol=1e-4)
        self.assertEqual(actual[:,-1].argmax(-1).tolist(),reference[:,-1].argmax(-1).tolist())
        print('NUMPY_PARITY', {'max_abs_logits':float(np.max(np.abs(actual.numpy()-reference))),
                               'traces':len(reftraces),'positions':len(fens)})
        # Strict coverage: an unknown tensor must never be silently discarded.
        raw = model.read_official_arrays(checkpoint)
        raw['unexpected'] = np.zeros(1,np.float32)
        with self.assertRaisesRegex(ValueError,'keys'):
            model.convert_arrays(raw,semantics)
        raw.pop('unexpected')
        key=next(iter(raw)); raw[key]=np.zeros(1,np.float32)
        with self.assertRaisesRegex(ValueError,'shape'):
            model.convert_arrays(raw,semantics)


def numpy_reference(checkpoint, tokens, semantics):
    """Independent float64 equations, raw source arrays, no PyTorch forward/map.

    This proves the implementation of the stated candidate equations, NOT that
    unavailable original Flax source used those equations/defaults.
    """
    import model
    p={k:v.astype(np.float64) for k,v in model.read_official_arrays(checkpoint).items()}
    def get(name): return p['params.'+name]
    def norm(h,i):
        mean=np.mean(h,axis=-1,keepdims=True)
        var=np.mean((h-mean)**2,axis=-1,keepdims=True)
        return (h-mean)/np.sqrt(var+semantics.layer_norm_eps)*get(f'LayerNorm_{i}.scale')+get(f'LayerNorm_{i}.bias')
    def softmax(x):
        z=np.exp(x-x.max(-1,keepdims=True)); return z/z.sum(-1,keepdims=True)
    shifted=np.concatenate([np.zeros((len(tokens),1),dtype=int),tokens[:,:-1]],axis=1)
    h=get('Embed_0.embedding.value')[shifted]*semantics.embedding_scale+get('Embed_1.embedding.value')[None,:tokens.shape[1]]
    traces={'embedding':h.copy()}
    for i in range(8):
        x=norm(h,2*i)
        prefix=f'MultiHeadDotProductAttention_{i}.'
        q,k,v=[np.einsum('bti,ihd->bthd',x,get(prefix+n+'.kernel')) for n in ['query','key','value']]
        scores=np.einsum('bthd,bshd->bhts',q,k)/np.sqrt(32.)
        a=softmax(scores)
        attention=np.einsum('bhts,bshd->bthd',a,v)
        h=h+np.einsum('bthd,hdo->bto',attention,get(prefix+'out.kernel'))
        traces[f'attention_{i}']=h.copy()
        x=norm(h,2*i+1)
        gate=x@get(f'Dense_{3*i}.kernel.value')
        up=x@get(f'Dense_{3*i+1}.kernel.value')
        h=h+((gate/(1+np.exp(-gate)))*up)@get(f'Dense_{3*i+2}.kernel.value')
        traces[f'block_{i}']=h.copy()
    h=norm(h,16); traces['final_norm']=h.copy()
    return h@get('Dense_24.kernel.value')+get('Dense_24.bias'),traces


class CLITests(unittest.TestCase):
    def test_cli_explicit_opt_in(self):
        import subprocess,sys,json
        from pathlib import Path
        root=Path(__file__).resolve().parents[2]
        cli=root/'spikes/deepmind-9m/cli.py'
        self.assertTrue(cli.exists(),'CLI is not implemented')
        base=[sys.executable,str(cli),'--checkpoint',str(root/'.cache/research/weights/9M_behavioral_cloning')]
        refused=subprocess.run(base,capture_output=True,text=True)
        self.assertNotEqual(refused.returncode,0)
        self.assertIn('experimental',refused.stderr)
        result=subprocess.run(base+['--allow-experimental','--layer-norm-eps','1e-6','--embedding-scale','16','--top','3'],capture_output=True,text=True,check=True)
        payload=json.loads(result.stdout)
        self.assertFalse(payload['metadata']['official_semantics_verified'])
        self.assertEqual(len(payload['top_moves']),3)
        self.assertEqual(payload['legal_move_count'],20)


if __name__ == '__main__': unittest.main()
