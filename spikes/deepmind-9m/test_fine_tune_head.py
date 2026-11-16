import unittest
import torch
from fine_tune_head import fit_value_head

class HeadTests(unittest.TestCase):
    def test_policy_learning_and_protected_base(self):
        head=torch.nn.Linear(2,2,bias=False)
        with torch.no_grad():head.weight.copy_(torch.tensor([[0.,2.],[2.,0.]]))
        before=head.weight.detach().clone()
        def row(i):return {'id':i,'features':torch.eye(2),'target':torch.tensor([0.,1.]),'best':1}
        result=fit_value_head(head,[row('train')],[row('validation')],epochs=30,lr=.1,patience=10)
        self.assertEqual(result['baseline']['top1'],0)
        self.assertEqual(result['selected']['top1'],1)
        self.assertTrue(torch.equal(head.weight,before))
        self.assertFalse(torch.equal(result['state_dict']['weight'],before))
        with self.assertRaises(ValueError):fit_value_head(head,[row('a')],[row('a')])
if __name__=='__main__':unittest.main()
