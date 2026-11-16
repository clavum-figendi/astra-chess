"""Action-value conversion checks; no training or held-out data."""
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

class ExtractionTests(unittest.TestCase):
    def test_verified_safe_extraction(self):
        import action_value as av
        self.assertTrue(hasattr(av,'extract_official'),'archive extractor missing')
        import zipfile,tempfile
        destination=av.extract_official(ROOT/'.cache/research/9M.zip',ROOT/'.cache/research/weights')
        self.assertEqual(destination,ROOT/'.cache/research/weights/9M/6400000/params')
        self.assertTrue((destination/'manifest.ocdbt').exists())
        with tempfile.TemporaryDirectory(dir=ROOT/'.cache') as d:
            bad=Path(d)/'bad.zip'
            with zipfile.ZipFile(bad,'w') as z:z.writestr('../escape','x')
            with self.assertRaises(ValueError):av.extract_official(bad,Path(d)/'out')

class ModelTests(unittest.TestCase):
    def test_cli_conversion_and_reload(self):
        import subprocess,sys,json,tempfile
        with tempfile.TemporaryDirectory(dir=ROOT/'.cache') as d:
            out=Path(d)/'av.pt'
            base=[sys.executable,str(ROOT/'spikes/deepmind-9m/action_value.py')]
            result=subprocess.run(base+['--checkpoint',str(ROOT/'.cache/research/weights/9M/6400000/params'),
                '--save',str(out),'--top','3'],capture_output=True,text=True,check=True)
            self.assertTrue(result.stdout.strip(),'action-value CLI is missing')
            payload=json.loads(result.stdout)
            self.assertTrue(out.exists())
            self.assertEqual(payload['legal_move_count'],20)
            self.assertEqual(len(payload['top_moves']),3)
            self.assertGreater(payload['inference_seconds'],0)
            reread=subprocess.run(base+['--converted',str(out),'--top','3'],capture_output=True,text=True,check=True)
            self.assertEqual(json.loads(reread.stdout)['top_moves'],payload['top_moves'])

    def test_expected_values_ranking_and_roundtrip(self):
        import action_value as av
        self.assertTrue(hasattr(av,'expected_values'),'bucket expectation is missing')
        import torch,numpy as np,chess,tempfile
        torch.set_num_threads(1)
        m,metadata=av.load_official(ROOT/'.cache/research/weights/9M/6400000/params')
        logits=torch.zeros(2,128)
        np.testing.assert_allclose(av.expected_values(logits).numpy(),[.5,.5],atol=1e-7)
        logits[:]=-1000;logits[0,0]=0;logits[1,-1]=0
        np.testing.assert_allclose(av.expected_values(logits).numpy(),[.5/128,127.5/128],atol=1e-7)
        board=chess.Board();before=board.fen()
        ranked=av.rank_legal(m,board,batch_size=4)
        ranked2=av.rank_legal(m,board,batch_size=20)
        self.assertEqual(len(ranked),20)
        self.assertEqual({r['move'] for r in ranked},{x.uci() for x in board.legal_moves})
        self.assertEqual(ranked[0]['move'],ranked2[0]['move'])
        a={r['move']:r['expected_value'] for r in ranked2}
        np.testing.assert_allclose([r['expected_value'] for r in ranked],[a[r['move']] for r in ranked],atol=1e-5)
        self.assertEqual(board.fen(),before)
        repeated=chess.Board()
        for uci in ['g1f3','g8f6','f3g1','f6g8']*2:repeated.push_uci(uci)
        history=list(repeated.move_stack)
        draw_ranked=av.rank_legal(m,repeated,batch_size=8)
        self.assertEqual(next(r['expected_value'] for r in draw_ranked if r['move']=='g1f3'),.5)
        self.assertEqual(repeated.move_stack,history)
        self.assertTrue(all(0<=r['expected_value']<=1 for r in ranked))
        self.assertEqual(ranked[0]['expected_value'],max(r['expected_value'] for r in ranked))
        self.assertEqual(av.rank_legal(m,chess.Board('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1')),[])
        with self.assertRaises(ValueError):av.rank_legal(m,board,batch_size=0)
        t=av.encode_state_actions(before,['e2e4'])
        # Right shift must discard final dummy labels, including bucket IDs.
        t2=t.clone();t2[:,-1]=127
        with torch.no_grad():torch.testing.assert_close(m(t),m(t2),rtol=0,atol=0)
        m.zero_grad(set_to_none=True);m(t).square().mean().backward()
        self.assertTrue(torch.isfinite(m.token_embedding.weight.grad).all().item())
        self.assertGreater(m.head.weight.grad.abs().sum().item(),0)
        with tempfile.TemporaryDirectory(dir=ROOT/'.cache') as d:
            out=Path(d)/'av.pt';av.save_converted(m,out,metadata)
            restored,restored_meta=av.load_converted(out)
            self.assertEqual(restored_meta['parameter_selection'],'params')
            with torch.no_grad():torch.testing.assert_close(restored(t),m(t),rtol=0,atol=0)
        with self.assertRaises(ValueError):av.save_converted(m,ROOT/'not-cache.pt',metadata)
        with self.assertRaises(ValueError):av.read_official_arrays(ROOT/'.cache/research/weights/9M/6400000/params_ema')

    def test_haiku_reference_and_strict_import(self):
        import action_value as av
        self.assertTrue(hasattr(av,'load_official'),'strict action-value loader missing')
        import numpy as np,torch,chess,subprocess,sys,os,tempfile
        torch.set_num_threads(1)
        m,metadata=av.load_official(ROOT/'.cache/research/weights/9M/6400000/params')
        self.assertEqual(metadata['tensor_count'],94)
        self.assertEqual(metadata['parameter_count'],sum(p.numel() for p in m.parameters()))
        fen=chess.STARTING_FEN
        t=torch.cat([av.encode_state_actions(fen,['e2e4','d2d4']),
            av.encode_state_actions('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',['b8c6']),
            av.encode_state_actions('r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 12 234',['e5d6','e1g1']),
            av.encode_state_actions('4k3/P7/8/8/8/8/7p/4K3 b - - 12 234',['h2h1n'])])
        self.assertEqual(tuple(t.shape),(6,79))
        from model import move_index,tokenize
        np.testing.assert_array_equal(t[0,:77].numpy(),tokenize(fen))
        self.assertEqual(t[0,77].item(),move_index('e2e4'))
        self.assertEqual(t[0,78].item(),0)
        with tempfile.TemporaryDirectory(dir=ROOT/'.cache') as d:
            inp=Path(d)/'in.npz';out=Path(d)/'ref.npz'
            np.savez(inp,tokens=t.numpy())
            env=dict(os.environ,OPENBLAS_NUM_THREADS='1',OMP_NUM_THREADS='1',JAX_PLATFORMS='cpu',XLA_FLAGS='--xla_cpu_multi_thread_eigen=false intra_op_parallelism_threads=1')
            subprocess.run([sys.executable,__file__,'--jax-reference',str(inp),str(out)],env=env,check=True)
            ref=np.load(out)
            with torch.no_grad():
                logits=m(t,return_all=True)
                feats=m.forward_features(t)
                np.testing.assert_allclose(logits.numpy(),ref['logits'],atol=3e-4,rtol=3e-5)
                np.testing.assert_allclose(feats.numpy(),ref['features'],atol=2e-5,rtol=2e-5)
                np.testing.assert_allclose(torch.log_softmax(logits,-1).numpy(),ref['log_probs'],atol=3e-4,rtol=3e-5)
                # Unsupervised earlier-token logits can be very sharp; float32
                # JAX/PyTorch reductions differ by up to ~8.3e-6 in expectation.
                np.testing.assert_allclose(av.expected_values(logits).numpy(),ref['expected_values'],atol=1.2e-5,rtol=1e-5)
                np.testing.assert_allclose(av.expected_values(logits[:,-1]).numpy(),ref['expected_values'][:,-1],atol=2e-6,rtol=2e-6)
                torch.testing.assert_close(m(t),m.head(feats),rtol=0,atol=0)
                self.assertEqual(m.head.out_features,128)
                print('HAIKU_PARITY',{'max_abs_logits':float(np.max(np.abs(logits.numpy()-ref['logits']))),
                       'max_abs_features':float(np.max(np.abs(feats.numpy()-ref['features']))),
                       'max_abs_log_probs':float(np.max(np.abs(torch.log_softmax(logits,-1).numpy()-ref['log_probs']))),
                       'max_abs_expected_values':float(np.max(np.abs(av.expected_values(logits).numpy()-ref['expected_values']))),
                       'max_abs_last_expected_values':float(np.max(np.abs(av.expected_values(logits[:,-1]).numpy()-ref['expected_values'][:,-1]))),
                       'parameter_count':metadata['parameter_count']})
        raw=av.read_official_arrays(ROOT/'.cache/research/weights/9M/6400000/params')
        raw['bogus']=np.zeros(1,np.float32)
        with self.assertRaisesRegex(ValueError,'keys'):av.convert_arrays(raw)
        raw.pop('bogus');key=next(iter(raw));raw[key]=np.zeros(1,np.float32)
        with self.assertRaisesRegex(ValueError,'shape'):av.convert_arrays(raw)


def jax_reference(input_path,output_path):
    """Execute reviewed, hash-bound OFFICIAL source with original Haiku params.

    Remove only the unused heavyweight constants-interface import. No changes
    to mathematical code, defaults, layer naming or configuration.
    """
    import numpy as np,tensorstore as ts,ast,types,sys,hashlib,urllib.request
    import jax,haiku as hk
    source_path=ROOT/'.cache/research/transformer.py'
    source=source_path.read_bytes()
    assert hashlib.sha256(source).hexdigest()=='7359830c02a3ab92a849dad46b71320d0a6c5b8c4d575640136917b1c3fcc6a2', 'local source differs from reviewed pinned source'
    tree=ast.parse(source)
    tree.body=[n for n in tree.body if not(isinstance(n,ast.ImportFrom) and n.module=='searchless_chess.src')]
    mod=types.ModuleType('reviewed_official_transformer');sys.modules[mod.__name__]=mod
    mod.constants=types.SimpleNamespace(Predictor=object)
    exec(compile(ast.fix_missing_locations(tree),str(source_path),'exec'),mod.__dict__)
    config=mod.TransformerConfig(vocab_size=1968,output_size=128,embedding_dim=256,num_layers=8,num_heads=8,
            use_causal_mask=False,pos_encodings=mod.PositionalEncodings.LEARNED,max_sequence_length=79,
            widening_factor=4,apply_qk_layernorm=False,apply_post_ln=True)
    path=ROOT/'.cache/research/weights/9M/6400000/params'
    kv={'driver':'ocdbt','base':{'driver':'file','path':str(path.resolve())+'/'}}
    store=ts.KvStore.open(kv).result();params={}
    for key in store.list().result():
        if not key.endswith(b'/.zarray'):continue
        key=key.decode().removesuffix('/.zarray')
        module,name=key.rsplit('.',1)
        a=ts.open({'driver':'zarr','kvstore':kv,'path':key},open=True).result().read().result()
        params.setdefault(module,{})[name]=np.asarray(a)
    capture={}
    def interceptor(next_f,args,kwargs,context):
        result=next_f(*args,**kwargs)
        if context.method_name=='__call__':
            if context.module.module_name=='linear_24':capture['logits']=result
            if context.module.module_name=='layer_norm_16':capture['features']=result[:,-1]
        return result
    tokens=np.load(input_path)['tokens']
    transformed=hk.transform(lambda x:mod.transformer_decoder(x,config))
    with hk.experimental.intercept_methods(interceptor):
        result=transformed.apply(params,None,tokens)
    # Exact reviewed official utility function; original engine uses exp(logp)
    # followed by inner product with these centers.
    utils_tree=ast.parse((ROOT/'.cache/research/utils.py').read_text())
    bucket_fn=next(n for n in utils_tree.body if isinstance(n,ast.FunctionDef) and n.name=='get_uniform_buckets_edges_values')
    scope={'np':np}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[bucket_fn],type_ignores=[])),'reviewed-official-buckets','exec'),scope)
    _,centers=scope['get_uniform_buckets_edges_values'](128)
    np.savez(output_path,log_probs=np.asarray(result),logits=np.asarray(capture['logits']),
             features=np.asarray(capture['features']),expected_values=np.inner(np.exp(np.asarray(result)),centers))
    print('REFERENCE',{'source_sha256':hashlib.sha256(source).hexdigest(),'jax':jax.__version__,'haiku':hk.__version__,'tokens':list(tokens.shape)})


if __name__=='__main__':
    import sys
    if len(sys.argv)>1 and sys.argv[1]=='--jax-reference':jax_reference(sys.argv[2],sys.argv[3])
    else:unittest.main()

