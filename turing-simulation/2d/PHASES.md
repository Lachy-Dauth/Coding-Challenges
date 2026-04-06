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
- Scan right from `$` to find `s^`
- Read the symbol under hat → determines which 2D rule fires
- Transition to the appropriate direction phase based on the 2D rule

## Phase 2: Write
- Replace `s^` with `s'^` (new symbol with hat, per the 2D transition)
- Then branch to the direction handler

## Phase 3: Direction Handlers

### R (move right)

#### R_peek
- From hat, move right one cell
- If `#` or `$` → at edge → R_expand
- Else → R_moveRight

#### R_expand (edge case)
- Need to insert one blank cell at the end of EVERY block
- Go to start of tape (`$`)
- For each block: scan to `#`/`$`, shift the separator and everything after it right by one, insert `_` before the separator
- This is a multi-pass shift: find `#`, carry everything right by 1, repeat for next `#`
- After all blocks expanded, fall through to R_moveRight

#### R_moveRight
- Move all `^` and `~` markers one cell right
- Scan tape: find `s^`, replace with `s`, write `s'^` to the cell on the right (need to carry)
- Same for each `s~` → shift right
- After all markers moved, go back to hat → Phase 1 (next step)

### L (move left)

#### L_peek
- From hat, move left one cell
- If `$` or `#` → at left edge → L_boundary (stay in place, do nothing)
- Else → L_moveLeft

#### L_boundary
- Head stays, go back to hat → Phase 1

#### L_moveLeft
- Move all `^` and `~` markers one cell left
- Same carry logic as R but leftward
- After done → Phase 1

### U (move up)

#### U_peek
- From hat, check if hat is in the LAST block (block ends with `$` not `#`)
- Scan right from hat to next `#` or `$`
- If `$` → last block → U_expand
- If `#` → not last block → U_moveUp

#### U_expand (edge case)
- Append a new block of same width as existing blocks
- Replace trailing `$` with `#`
- Write `width` blank cells
- Write `$`
- Also add `~` marker in the new block at the same column as hat
- Fall through to U_moveUp

#### U_moveUp
- Replace `s^` with `s~`
- Scan right past `#` to find `s~` in the next block
- Replace that `s~` with `s^`
- Go back to hat → Phase 1

### D (move down)

#### D_peek
- Check if hat is in the FIRST block (block starts with `$` not `#`)
- Scan left from hat to `#` or `$`
- If `$` → first block → D_boundary (stay in place)
- If `#` → not first block → D_moveDown

#### D_boundary
- Head stays → Phase 1

#### D_moveDown
- Replace `s^` with `s~`
- Scan left past `#` to find `s~` in the previous block
- Replace that `s~` with `s^`
- Go back to hat → Phase 1

### * (stay)
- Do nothing → Phase 1

## Shared Sub-operations

### scan_right_to_boundary
- Skip regular symbols, `~` symbols until hitting `#` or `$`

### scan_left_to_boundary
- Skip regular symbols, `~` symbols until hitting `#` or `$`

### shift_right_by_one
- Carry chain: read cell, write carried value, carry read value, repeat
- Need per-symbol carry states

### expand_all_blocks
- Used by R_expand
- Insert `_` before each `#` and before final `$`
- Shift everything after the insertion point right by 1
- Repeat for each separator

### rewind_to_hat
- Scan left/right to find `s^`, used to return after operations

## State Naming Convention
```
{2Dstate}_{readSym}_{direction}_{phase}_{subphase}_{carriedSymbol}
```
Each 2D rule generates its own full set of 1D states. The 2D transition info (write symbol, direction, new state) is hardcoded into the generated rules.

Examples for 2D rule `copy 1 Y u w1`:
- `copy_1_write` — replace `1^` with `Y^` on the tape
- `copy_1_U_peek` — check if hat is in last block
- `copy_1_U_expand_scan` — scanning right for next `#`/`$` to expand
- `copy_1_U_expand_shift_0` — shifting a block right, carrying `0`
- `copy_1_U_move` — swap `^` with `~` in the next block up
- `copy_1_U_done` — rewind to hat, transition to `w1` (the 2D new-state)

Examples for 2D rule `scan 0 0 r scan`:
- `scan_0_write` — replace `0^` with `0^` (same symbol)
- `scan_0_R_peek` — check if hat is at right edge of block
- `scan_0_R_expand_scan` — expand blocks if at edge
- `scan_0_R_move_carry_0^` — carrying hatted `0` one cell right
- `scan_0_R_done` — rewind to hat, transition to `scan`
