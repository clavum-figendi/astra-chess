import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import torch
from v7_head_candidates import structured_head
class HeadTests(unittest.TestCase):
 def test_identity_and_isolated_draw_bucket(self):
  head=torch.nn.Linear(256,128);original={k:v.clone() for k,v in head.state_dict().items()}
  identity=structured_head(head,1,0)
  for k,v in identity.state_dict().items():self.assertTrue(torch.equal(v,original[k]))
  changed=structured_head(head,1,.05)
  self.assertTrue(torch.equal(changed.weight,head.weight));self.assertEqual(int((changed.bias!=head.bias).sum()),1)
  self.assertAlmostEqual(float(changed.bias[63]-head.bias[63]),.05,places=6)
  for k,v in head.state_dict().items():self.assertTrue(torch.equal(v,original[k]))
if __name__=='__main__':unittest.main()
