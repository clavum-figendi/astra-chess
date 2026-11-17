"""Unit fixtures for outcome accounting; not chess-strength evidence."""
import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from v8_evaluate import summarize_games

class OutcomeTests(unittest.TestCase):
    def test_cap_never_becomes_scored_draw(self):
        for result in ['*','1/2-1/2']:
            r=summarize_games([{'color':'w','result':result,'termination':'ply-cap'}])
            self.assertEqual(r,{'games':1,'wins':0,'losses':0,'draws':0,'unresolved':1})
    def test_colors_and_rule_draws(self):
        fixtures=[{'color':'w','result':'1-0','termination':'checkmate'},
                  {'color':'b','result':'0-1','termination':'checkmate'},
                  {'color':'b','result':'1-0','termination':'checkmate'},
                  {'color':'w','result':'1/2-1/2','termination':'threefold_repetition'}]
        self.assertEqual(summarize_games(fixtures),{'games':4,'wins':2,'losses':1,'draws':1,'unresolved':0})

if __name__=='__main__':unittest.main()
