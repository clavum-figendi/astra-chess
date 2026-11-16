// Directly authored by Astra. Three-man specialist compiled to plain affine/ReLU.
// No chess library, successor boards, tablebase, or inference-time special opcode.
const f=s=>s%8, r=s=>Math.floor(s/8);
const piece=(side,type,square)=>(side*6+type)*64+square;
const distance=(a,b)=>Math.max(Math.abs(f(a)-f(b)),Math.abs(r(a)-r(b)));
const neighbors=s=>Array.from({length:64},(_,v)=>v).filter(v=>v!==s&&distance(v,s)===1);
function between(from,to,type){
  if(from===to)return null;
  const df=f(to)-f(from),dr=r(to)-r(from);
  const straight=df===0||dr===0, diagonal=Math.abs(df)===Math.abs(dr);
  if(!straight && !(type===4 && diagonal))return null;
  const squares=[];
  for(let x=f(from)+Math.sign(df),y=r(from)+Math.sign(dr);x!==f(to)||y!==r(to);x+=Math.sign(df),y+=Math.sign(dr))squares.push(y*8+x);
  return squares;
}
export function buildKingEndgames(g){
  const squares=Array.from({length:64},(_,s)=>s);
  const absent=[];const majors=[];
  for(const s of squares){
    for(let t=0;t<5;t++)absent.push([piece(1,t,s),-1]);
    for(let t=0;t<3;t++)absent.push([piece(0,t,s),-1]);
    for(const t of [3,4])majors.push([piece(0,t,s),1]);
  }
  const majorCount=g.node(majors,0,0);
  const excess=g.node([[majorCount,1]],-1);
  const exactlyOne=g.node([[majorCount,1],[excess,-2]]);
  const scope=g.and(exactlyOne,g.node(absent,1));
  const royalCoverage=squares.map(s=>g.any([s,...neighbors(s)].map(v=>piece(0,5,v))));
  const currentCoverage=squares.map(target=>{
    const attacks=[royalCoverage[target]];
    for(const type of [3,4])for(const origin of squares){
      const blockers=between(origin,target,type);if(blockers===null)continue;
      attacks.push(g.node([[piece(0,type,origin),1],...blockers.map(s=>[piece(0,5,s),-1])]));
    }
    return g.any(attacks);
  });
  function properties(coverage){
    const mates=[],stalemates=[],covered=[];
    for(const enemy of squares){
      const ring=neighbors(enemy);
      const noEscape=g.node(ring.map(s=>[coverage[s],1]),1-ring.length);
      const king=piece(1,5,enemy);
      mates.push(g.and(king,noEscape,coverage[enemy]));
      stalemates.push(g.node([[king,1],[noEscape,1],[coverage[enemy],-1]],-1));
      // Ring size <=8 makes this an exact binary-selector gate on valid boards.
      covered.push(g.node([...ring.map(s=>[coverage[s],1]),[king,8]],-8));
    }
    return {mate:g.any(mates),stalemate:g.any(stalemates),covered:g.node(covered.map(n=>[n,1]),0,0)};
  }
  const current=properties(currentCoverage);
  const maps={3:[],4:[],5:[]};
  for(const type of [3,4,5])for(const destination of squares){
    const coverage=squares.map(target=>{
      if(type===5){
        if(distance(destination,target)<=1)return g.node([],1,0);
        const attackers=[];
        for(const major of [3,4])for(const origin of squares){
          const blockers=between(origin,target,major);
          if(blockers!==null&&!blockers.includes(destination))attackers.push(piece(0,major,origin));
        }
        return g.any(attackers);
      }
      const blockers=between(destination,target,type);
      const attack=blockers===null?g.zero:g.node(blockers.map(s=>[piece(0,5,s),-1]),1);
      return g.any([royalCoverage[target],attack]);
    });
    maps[type].push(properties(coverage));
  }
  return (from,to,types)=>{
    if(from===to)return [];
    const terms=[];
    for(const type of types){
      if(!maps[type]||(type===5&&distance(from,to)!==1))continue;
      const active=g.and(scope,piece(0,type,from));
      const candidate=maps[type][to];
      terms.push([g.and(active,candidate.mate),100],[g.and(active,candidate.stalemate),-100]);
      const after=g.node([[candidate.covered,1],[active,8]],-8);
      const before=g.node([[current.covered,1],[active,8]],-8);
      terms.push([after,0.12],[before,-0.12]);
    }
    return terms;
  };
}
