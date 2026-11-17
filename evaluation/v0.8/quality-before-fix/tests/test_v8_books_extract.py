import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('extract', ROOT / 'tools/v8-books-extract.py')
assert spec is not None and spec.loader is not None
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

class ExtractTest(unittest.TestCase):
    def test_complete_qualified_game_only(self):
        tags={'Event':'Rated Blitz game','Site':'https://lichess.org/abcdefgh','WhiteElo':'2210','BlackElo':'2400','Result':'1-0','TimeControl':'180+2'}
        self.assertEqual(extract.select_game(tags,'1. e4! { [%clk 1:00] } 1... e5 2. Nf3 $1 Nc6 1-0')['moves'],'e4 e5 Nf3 Nc6')
        self.assertIsNone(extract.select_game(tags,'1. e4 e5 2. Nf3'))
        self.assertIsNone(extract.select_game({**tags,'WhiteElo':'2199'},'1. e4 e5 1-0'))
        self.assertIsNone(extract.select_game({**tags,'Event':'Rated Bullet game'},'1. e4 e5 1-0'))
        self.assertIsNone(extract.select_game({**tags,'SetUp':'1'},'1. e4 e5 1-0'))

if __name__=='__main__': unittest.main()
