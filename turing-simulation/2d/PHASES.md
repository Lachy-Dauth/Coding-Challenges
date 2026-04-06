# 2D→1D Simulation Phases

## Tape Layout
```
$ block0 # block1 # block2 # ... # blockN $
```
- `$` = tape boundaries
- `#` = block separator
- `s^` = hat (head position)
- `s~` = tilde (same column marker in other rows)
- Each block = one row, all blocks same width

## Phase 0: Init
- Shift input right, insert `$` at start
- Hat-mark first symbol
- Append `$` at end
- Result: `$ w1^ w2 ... wn $`

## Phase 1: Find Hat
- Scan left to `$`, then scan right to find `s^`
- Read the symbol under hat → determines which 2D rule fires
- Transition to the write phase

## Phase 2: Write
- Replace `s^` with `s'^` (new symbol with hat, per the 2D transition)
- Then branch to the direction handler (peek phase) based on the rule's direction

## Phase 3: Direction Handlers

### R (move right)

#### R_peek
- From hat, move right one cell
- If `#` or `$` → at right edge of block → R_expand
- Else → R_move (not at edge, just shift markers)

#### R_expand
- Need to insert one blank cell at the end of EVERY block (to keep all blocks the same width)
- Go left to `$` (start of tape)
- Scan right for each unmarked `#`:
  - Replace `#` with `_` (the inserted blank)
  - Carry `#'` (marked separator) rightward through a carry chain — each cell's value is displaced one position right
  - When carrying `$`, write it to the blank past the end, then rewind to `$` and repeat for the next `#`
- After all `#` are processed, expand the final `$` the same way (replace with `_`, place `$` one right)
- Cleanup: scan left replacing all `#'` back to `#`
- Fall through to R_move

#### R_move
- Shift all `^` and `~` markers one cell right
- Go left to `$`, then scan right
- When a hatted symbol `s^` is found: strip to `s`, move right, add `^` to that cell (`t` → `t^`)
- When a tilded symbol `s~` is found: strip to `s`, move right, add `~` to that cell (`t` → `t~`)
- Continue scanning right until `$`
- After all markers shifted → findHat for the new state

### L (move left)

#### L_peek
- From hat, move left one cell
- If `$` or `#` → at left edge of block → boundary clamp (stay in place, go to findHat)
- Else → L_move

#### L_move
- Shift all `^` and `~` markers one cell left
- Go right to `$`, then scan left
- When a hatted symbol `s^` is found: strip to `s`, move left, add `^` to that cell
- When a tilded symbol `s~` is found: strip to `s`, move left, add `~` to that cell
- Continue scanning left until `$`
- After all markers shifted → findHat for the new state

### U (move up)

#### U_peek
- From hat, scan right to next `#` or `$`
- If `$` → hat is in the last block → U_expand
- If `#` → not last block → U_move

#### U_expand
- Append a new block of same width as existing blocks using a ping-pong approach:
  - Replace trailing `$` with `#'` (marked separator), write `$` one cell right
  - Go left to start of hat's block
  - Mark: scan right, find first unmarked cell in the old block, mark it with `'`
    - If it's a hatted cell `s^`, mark as `s^'` and use a special variant that writes `_~` in the new block (preserving column alignment)
    - Otherwise mark `s` as `s'` and write `_` in the new block
  - Go right to `$`, replace with the new cell value, write `$` one right
  - Repeat until hitting `#'` (all cells marked)
  - Finalize: replace `#'` with `#`, unmark all `s'` → `s` and `s^'` → `s^`
- Fall through to U_move

#### U_move
- Go left to `$`, scan right to find hat `s^`
- Replace `s^` with `s~` (demote to tilde)
- Scan right past `#` into the next block to find `t~`
- Replace `t~` with `t^` (promote to hat)
- Go to findHat for the new state

### D (move down)

#### D_peek
- From hat, scan left to `#` or `$`
- If `$` → hat is in the first block → boundary clamp (stay in place, go to findHat)
- If `#` → not first block → D_move

#### D_move
- Go right to `$`, scan left to find hat `s^`
- Replace `s^` with `s~` (demote to tilde)
- Scan left past `#` into the previous block to find `t~`
- Replace `t~` with `t^` (promote to hat)
- Go to findHat for the new state

### * (stay)
- Do nothing → findHat for the new state

## State Naming Convention
```
{2Dstate}_{readSym}_{phase}_{subphase}_{detail}
```
Each 2D rule generates its own full set of 1D states. The 2D transition info (write symbol, direction, new state) is hardcoded into the generated rules.

Examples for 2D rule `copy 1 Y u w1`:
- `copy_scanHat` — scanning right for hatted symbol
- `copy_1_write` — replace `1^` with `Y^` on the tape
- `w1_U_peek` — check if hat is in last block
- `w1_U_expand_start` — begin appending new block
- `w1_U_expand_mark` — marking old-block cells one at a time
- `w1_U_expand_goRight_hat` — going right to add `_~` (hat column variant)
- `w1_U_move_scanHat` — scanning for hat to demote to tilde
- `w1_U_move_findTilde` — scanning for tilde in next block to promote to hat

Examples for 2D rule `scan 0 0 r scan`:
- `scan_scanHat` — scanning right for hatted symbol
- `scan_0_write` — replace `0^` with `0^` (same symbol)
- `scan_R_peek` — move right one cell, check for `#`/`$`
- `scan_R_expand_findSep` — scanning for next `#` to expand
- `scan_R_expand_carry_0h` — carry chain, currently carrying `0^`
- `scan_R_move_scan` — scanning for markers to shift right
- `scan_R_move_addHat` — adding `^` to the next cell
