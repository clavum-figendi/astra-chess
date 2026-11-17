import importlib.util, json, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('confirm',ROOT/'tools/v8_confirm.py')
assert spec is not None and spec.loader is not None
confirm=importlib.util.module_from_spec(spec);spec.loader.exec_module(confirm)
class FreezeTests(unittest.TestCase):
    def test_snapshot_tools_execute_the_node_entrypoint(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'src').symlink_to(ROOT/'src',target_is_directory=True)
            confirm.prepare_tools(root)
            script=root/'tools/v8-score-sparse.mjs'
            self.assertFalse(script.is_symlink())
            self.assertEqual(confirm.sha(script),confirm.sha(ROOT/'tools/v8-score-sparse.mjs'))
            r=subprocess.run(['node','tools/v8-score-sparse.mjs'],cwd=root,input=json.dumps({'model':{'file':'missing-test-fixture.bin','sha256':'0'*64},'rows':[]}),text=True,capture_output=True)
            self.assertNotEqual(r.returncode,0);self.assertIn('ENOENT',r.stderr)
    def test_runtime_byte_tamper_rejects_instead_of_rebinding(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'dependency';p.write_bytes(b'original')
            identity=lambda:{'files':{str(p):confirm.sha(p)}}
            with patch.object(confirm,'runtime_identity',side_effect=identity):
                expected=identity();confirm.verify_identity(expected)
                p.write_bytes(b'changed')
                with self.assertRaisesRegex(RuntimeError,'runtime changed'):confirm.verify_identity(expected)
    def test_version_or_opponent_digest_change_rejects(self):
        baseline={'packages':{'chess':'1.11.2'},'files':{'stockfish':'expected'}}
        for changed in [{'packages':{'chess':'changed'},'files':baseline['files']},{'packages':baseline['packages'],'files':{'stockfish':'changed'}}]:
            with patch.object(confirm,'runtime_identity',return_value=changed):
                with self.assertRaises(RuntimeError):confirm.verify_identity(baseline)
if __name__=='__main__':unittest.main()
