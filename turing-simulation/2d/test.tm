; Stress test: draw a 3x3 hollow rectangle
; Tests all 4 edge cases: R-expand, U-expand, L-boundary, D-boundary
; Start at (0,0) on empty tape
;
; Expected result:
;   row 2: 1 1 1
;   row 1: 1 _ 1
;   row 0: 1 1 1

; Right along row 0 — R-expand triggers at each step
s0 _ 1 r s1
s1 _ 1 r s2

; Up along col 2 — U-expand triggers at each step
s2 _ 1 u s3
s3 _ 1 u s4

; Left along row 2 — L-boundary clamp on last move (col 0)
s4 _ 1 l s5
s5 _ 1 l s6
s6 _ 1 l s7

; Down along col 0 — D-boundary clamp on last move (row 0)
s7 1 1 d s8
s8 _ 1 d s9
s9 1 1 d s10

s10 1 1 * halt
