import unittest
from uci import Protocol
class ProtocolTests(unittest.TestCase):
    def test_history_terminal_and_invalid_position(self):
        out=[];seen=[]
        def select(board):seen.append(board.fen());return sorted(board.legal_moves,key=lambda m:m.uci())[0].uci()
        p=Protocol(out.append,select);p.handle('uci');self.assertIn('uciok',out)
        p.handle('position startpos moves e2e4');p.handle('go');self.assertTrue(out[-1].startswith('bestmove '));self.assertIn(' b ',seen[-1])
        p.handle('position startpos moves e2e5');p.handle('go');self.assertEqual(out[-1],'bestmove 0000');self.assertEqual(len(seen),1)
        p.handle('position fen 7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');p.handle('go');self.assertEqual(out[-1],'bestmove 0000')
        p.handle('position startpos moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');p.handle('go');self.assertEqual(out[-1],'bestmove 0000');self.assertEqual(len(seen),1)
    def test_selector_cannot_return_illegal_move(self):
        out=[];p=Protocol(out.append,lambda b:'e2e5');p.handle('go');self.assertEqual(out[-1],'bestmove 0000');self.assertTrue(any('error' in s for s in out))
if __name__=='__main__':unittest.main()
