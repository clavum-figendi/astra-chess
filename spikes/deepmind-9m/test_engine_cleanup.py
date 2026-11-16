import unittest
from engine_cleanup import close_engines
class CleanupTests(unittest.TestCase):
    def test_failure_still_closes_every_engine(self):
        calls=[]
        class Engine:
            def __init__(self,name,fail=False):self.name=name;self.fail=fail
            def quit(self):
                calls.append(self.name+' quit')
                if self.fail:raise TimeoutError('quit timeout')
            def close(self):calls.append(self.name+' close')
        with self.assertRaises(TimeoutError):close_engines(Engine('legacy',True),Engine('opponent'))
        self.assertEqual(calls,['legacy quit','legacy close','opponent quit','opponent close'])
if __name__=='__main__':unittest.main()
