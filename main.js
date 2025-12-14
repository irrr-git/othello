(() => {
  const N = 6;
  const EMPTY = 0, BLACK = 1, WHITE = -1;

  const boardEl = document.getElementById('board');
  const modeSelect = document.getElementById('modeSelect');
  const resetBtn = document.getElementById('resetBtn');
  const undoBtn = document.getElementById('undoBtn');
  const toastEl = document.getElementById('toast');

  const turnText = document.getElementById('turnText');
  const turnDot  = document.getElementById('turnDot');
  const blackCountEl = document.getElementById('blackCount');
  const whiteCountEl = document.getElementById('whiteCount');

  const dirs = [
    [-1,-1], [-1,0], [-1,1],
    [ 0,-1],         [ 0,1],
    [ 1,-1], [ 1,0], [ 1,1],
  ];

  // CPUの重み（ここを後から変更OK / UIなし）
  // index = r*N + c（r,cは0始まり）
  const CPU_WEIGHTS = [
    80, -15,  10,  10, -15, 80,
    -15,-25,   2,   2, -25,-15,
    10,   2,   6,   6,  2,  10,
    10,   2,   6,   6,  2,  10,
    -15,-25,   2,   2, -25,-15,
    80, -15,  10,  10, -15, 80
  ];

  let board = makeEmptyBoard();
  let current = BLACK;
  let mode = 'friend';
  let history = [];

  buildCells();
  initBoard();   // 初期配置表示
  renderAll();   // すぐ友達対戦できる

  modeSelect.addEventListener('change', () => {
    mode = modeSelect.value;
    renderAll();
    maybeCpuMove();
  });

  resetBtn.addEventListener('click', () => {
    history = [];
    initBoard();
    renderAll();
    maybeCpuMove();
  });

  undoBtn.addEventListener('click', () => {
    if (!history.length) return;
    const prev = history.pop();
    board = prev.board;
    current = prev.current;
    mode = prev.mode;
    modeSelect.value = mode;
    renderAll();
    maybeCpuMove();
  });

  function buildCells(){
    boardEl.innerHTML = '';
    for (let r=0; r<N; r++){
      for (let c=0; c<N; c++){
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.type = 'button';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.addEventListener('click', onCellClick);
        boardEl.appendChild(cell);
      }
    }
  }

  function onCellClick(e){
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;

    // CPUモードでCPU(白)の手番は人は打てない
    if (mode === 'cpu' && current === WHITE) return;

    const moves = getValidMoves(board, current);
    if (!moves.has(`${r},${c}`)) return;

    pushHistory();
    applyMove(board, current, r, c);
    current *= -1;

    afterTurnAdvance();
  }

  function makeEmptyBoard(){
    return Array.from({length:N}, () => Array(N).fill(EMPTY));
  }

  function initBoard(){
    board = makeEmptyBoard();
    // 6×6 初期配置（中央2×2）
    board[2][2] = WHITE;
    board[2][3] = BLACK;
    board[3][2] = BLACK;
    board[3][3] = WHITE;
    current = BLACK;
    mode = modeSelect.value; // 初期は友達
  }

  function inBounds(r,c){ return r>=0 && r<N && c>=0 && c<N; }

  function getFlips(b, player, r, c){
    if (b[r][c] !== EMPTY) return [];
    const flips = [];
    for (const [dr,dc] of dirs){
      let rr = r+dr, cc = c+dc;
      const line = [];
      while (inBounds(rr,cc) && b[rr][cc] === -player){
        line.push([rr,cc]);
        rr += dr; cc += dc;
      }
      if (line.length && inBounds(rr,cc) && b[rr][cc] === player){
        flips.push(...line);
      }
    }
    return flips;
  }

  function getValidMoves(b, player){
    const moves = new Map();
    for (let r=0; r<N; r++){
      for (let c=0; c<N; c++){
        const flips = getFlips(b, player, r, c);
        if (flips.length) moves.set(`${r},${c}`, flips);
      }
    }
    return moves;
  }

  function applyMove(b, player, r, c){
    const flips = getFlips(b, player, r, c);
    if (!flips.length) return false;
    b[r][c] = player;
    for (const [rr,cc] of flips) b[rr][cc] = player;
    return true;
  }

  function countStones(b){
    let black=0, white=0;
    for (let r=0; r<N; r++){
      for (let c=0; c<N; c++){
        if (b[r][c] === BLACK) black++;
        else if (b[r][c] === WHITE) white++;
      }
    }
    return {black, white};
  }

  function isGameOver(){
    return getValidMoves(board, BLACK).size === 0 && getValidMoves(board, WHITE).size === 0;
  }

  function afterTurnAdvance(){
    if (isGameOver()){
      renderAll();
      return;
    }

    // 置けないなら自動パス（パスも待ったで戻せる）
    const movesNow = getValidMoves(board, current);
    if (movesNow.size === 0){
      pushHistory();
      showToast('パス');
      current *= -1;

      if (isGameOver()){
        renderAll();
        return;
      }
    }

    renderAll();
    maybeCpuMove();
  }

  function maybeCpuMove(){
    if (mode !== 'cpu') return;
    if (current !== WHITE) return; // CPU=白固定

    setTimeout(() => {
      if (mode !== 'cpu' || current !== WHITE) return;

      const moves = getValidMoves(board, WHITE);
      if (moves.size === 0){
        pushHistory();
        showToast('パス');
        current = BLACK;
        renderAll();
        return;
      }

      let best = null;
      let bestScore = -Infinity;

      for (const [key, flips] of moves.entries()){
        const [r,c] = key.split(',').map(Number);
        const w = CPU_WEIGHTS[r*N + c] ?? 0;
        const score = w + flips.length * 1.5; // 小ボーナス
        if (score > bestScore){
          bestScore = score;
          best = {r,c};
        }
      }

      pushHistory();
      applyMove(board, WHITE, best.r, best.c);
      current = BLACK;
      afterTurnAdvance();
    }, 260);
  }

  function pushHistory(){
    const copy = board.map(row => row.slice());
    history.push({ board: copy, current, mode });
    if (history.length > 200) history.shift();
  }

  function renderAll(){
    renderBoard();
    renderStatus();
    renderCounts();
    undoBtn.disabled = history.length === 0;
    if (isGameOver()) clearHints();
  }

  function renderBoard(){
    const moves = getValidMoves(board, current);
    const cells = boardEl.children;

    for (let i=0; i<cells.length; i++){
      const cell = cells[i];
      const r = +cell.dataset.r;
      const c = +cell.dataset.c;

      cell.classList.remove('hint');
      cell.innerHTML = '';

      const v = board[r][c];
      if (v === BLACK){
        const s = document.createElement('div');
        s.className = 'stone black';
        cell.appendChild(s);
      } else if (v === WHITE){
        const s = document.createElement('div');
        s.className = 'stone white';
        cell.appendChild(s);
      } else {
        // CPU手番中は候補を出さない（必要なら外してOK）
        const showHints = !(mode === 'cpu' && current === WHITE);
        if (showHints && moves.has(`${r},${c}`)) cell.classList.add('hint');
      }
    }
  }

  function clearHints(){
    const cells = boardEl.children;
    for (let i=0; i<cells.length; i++) cells[i].classList.remove('hint');
  }

  function renderStatus(){
    turnText.textContent = (current === BLACK) ? '黒' : '白';
    turnDot.classList.toggle('black', current === BLACK);
    turnDot.classList.toggle('white', current === WHITE);
  }

  function renderCounts(){
    const {black, white} = countStones(board);
    blackCountEl.textContent = black;
    whiteCountEl.textContent = white;
  }

  let toastTimer = null;
  function showToast(text){
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 900);
  }
})();
