import importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('complete',ROOT/'tools/v8_confirm_complete.py')
assert spec is not None and spec.loader is not None
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class BindingTests(unittest.TestCase):
 def test_real_inventory_covers_node_resolved_chess(self):
  p=mod.resolve_chess(ROOT)
  self.assertEqual(p,(ROOT/'node_modules/chess.js/dist/cjs/chess.js').resolve())
  self.assertEqual(mod.chess_inventory(ROOT)[str(p)],mod.sha(p))
 def test_actual_resolution_chooses_main_not_module_and_tracks_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'src').mkdir();pkg=root/'node_modules/chess.js';(pkg/'dist/cjs').mkdir(parents=True);(pkg/'dist/esm').mkdir()
   (pkg/'package.json').write_text(json.dumps({'name':'chess.js','main':'dist/cjs/chess.js','module':'dist/esm/chess.js'}))
   cjs=pkg/'dist/cjs/chess.js';cjs.write_text('module.exports={};');(pkg/'dist/esm/chess.js').write_text('export const unused=1;')
   first=mod.chess_inventory(root);self.assertIn(str(cjs),first)
   cjs.write_text('module.exports={changed:true};')
   self.assertNotEqual(first,mod.chess_inventory(root))
 def test_lineage_rejects_a_changed_digest(self):
  old={'manifestSHA256':'a','dataProtocolSHA256':'b','validationSHA256':'c'}
  mod.check_selection_lineage(old,dict(old))
  for k in old:
   with self.assertRaises(AssertionError):mod.check_selection_lineage(old,{**old,k:'changed'})
if __name__=='__main__':unittest.main()
