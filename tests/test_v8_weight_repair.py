import importlib.util
from pathlib import Path
import unittest
import torch
P=Path(__file__).resolve().parents[1]/'spikes/weight-repair-v8/repair.py'

class RepairTests(unittest.TestCase):
    def test_sparse_teacher_never_invents_unranked_mass(self):
        self.assertTrue(P.exists(), 'new bounded repair module is missing')
        spec=importlib.util.spec_from_file_location('repair',P)
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        target=mod.policy_target(['a','b','c','d'],'b',[{'move':'b','rank':1},{'move':'d','rank':2}])
        self.assertEqual(target[[0,2]].tolist(),[0.,0.])
        self.assertAlmostEqual(float(target.sum()),1.,places=6)
        self.assertGreater(float(target[1]),float(target[3]))

    def test_rank_one_is_foldable_and_bounded(self):
        spec=importlib.util.spec_from_file_location('repair',P)
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        self.assertTrue(hasattr(mod,'fold_rank_one'),'rank-one fold missing')
        w=torch.randn(128,256);direction=torch.linspace(-1,1,128);v=torch.randn(256)*10
        folded=mod.fold_rank_one(w,direction,v,.2)
        delta=folded-w
        self.assertLessEqual(float(torch.linalg.norm(delta)),.20001)
        x=torch.randn(3,256)
        bounded=v*min(1.,.2/float(torch.linalg.norm(direction)*torch.linalg.norm(v)))
        self.assertTrue(torch.allclose(x@folded.T,x@w.T+(x@bounded)[:,None]*direction[None,:],atol=1e-4))

    def test_hard_negative_gradient_promotes_best_over_unranked(self):
        spec=importlib.util.spec_from_file_location('repair',P)
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        self.assertTrue(hasattr(mod,'contrastive_loss'),'hard-negative objective missing')
        scores=torch.tensor([0.,2.,1.],requires_grad=True)
        target=torch.tensor([1.,0.,0.])
        mod.contrastive_loss(scores,target,0,temperature=1.,margin=.2).backward()
        self.assertLess(float(scores.grad[0]),0.)
        self.assertGreater(float(scores.grad[1]),0.)

if __name__=='__main__':unittest.main()
