import importlib.util, json, subprocess, sys, tempfile, unittest
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from v8_select import choose_candidate, require_unfrozen, policy_metrics

class SelectionTests(unittest.TestCase):
    def test_fitting_entrypoints_stop_before_loading_or_writing(self):
        root=Path(__file__).resolve().parents[1]
        sys.path.insert(0,str(root/'spikes/weight-repair-v8'))
        spec=importlib.util.spec_from_file_location('v8_fit',root/'spikes/weight-repair-v8/run.py')
        assert spec is not None and spec.loader is not None
        fit=importlib.util.module_from_spec(spec);spec.loader.exec_module(fit)
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d);setattr(fit,'CACHE',folder)
            (folder/'test-exposed.json').write_text('{}')
            with patch.object(fit,'load_converted',side_effect=AssertionError('Fitting reached model load')):
                with self.assertRaisesRegex(RuntimeError,'frozen'):fit.deepmind()
            with self.assertRaisesRegex(RuntimeError,'frozen'):fit.sparse('pocket')
            (folder/'.cache/v8').mkdir(parents=True)
            (folder/'.cache/v8/test-exposed.json').write_text('{}')
            result=subprocess.run(['node',str(root/'tools/v8-weights-sparse.mjs'),'export'],cwd=folder,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0);self.assertIn('frozen',result.stderr)
            self.assertFalse((folder/'evaluation').exists())
    def test_control_wins_hit_ties_even_with_worse_loss(self):
        base = {'id':'control','hits':3,'crossEntropy':9.,'changedScalars':0}
        proposal = {'id':'repair','hits':3,'crossEntropy':1.,'changedScalars':100}
        self.assertEqual(choose_candidate([proposal,base]),base)
        self.assertEqual(choose_candidate([{**proposal,'hits':4},base])['id'],'repair')
    def test_exposure_or_selection_blocks_writes(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d);require_unfrozen(folder)
            for name in ['test-exposed.json','selection.json']:
                (folder/name).write_text('{}')
                with self.assertRaises(RuntimeError):require_unfrozen(folder)
                (folder/name).unlink()
    def test_partial_teacher_and_lexical_tie(self):
        row={'legal':['b2b3','a2a3','c2c3'],'bestmove':'a2a3','teacher':[{'move':'a2a3','rank':1}]}
        r=policy_metrics([0,0,0],row,1)
        self.assertEqual(r['move'],'a2a3');self.assertTrue(r['hit'])
        self.assertAlmostEqual(r['crossEntropy'],1.0986122886681098)
        with self.assertRaises(ValueError):policy_metrics([0,float('nan'),0],row,1)

if __name__=='__main__':unittest.main()
