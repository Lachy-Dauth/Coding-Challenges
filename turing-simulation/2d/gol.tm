; Game of Life — Setup phase
; Creates 8x20 grid with # border and horizontal blinker at center
; Symbols: 1 (alive), 1' (next-alive), _ (dead), _' (next-dead), # (border)
; Init state: b0, empty tape, head at (0,0)
;
; Result:
;   row 7: # # # # # # # # # # # # # # # # # # # #
;   row 6: # _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ #
;   row 5: # _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ #
;   row 4: # _ _ _ _ _ _ _ _ 1 1 1 _ _ _ _ _ _ _ #
;   row 3: # _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ #
;   row 2: # _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ #
;   row 1: # _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ #
;   row 0: # # # # # # # # # # # # # # # # # # # #

; --- Bottom border: row 0, cols 0→19 ---
b0 _ # r b1
b1 _ # r b2
b2 _ # r b3
b3 _ # r b4
b4 _ # r b5
b5 _ # r b6
b6 _ # r b7
b7 _ # r b8
b8 _ # r b9
b9 _ # r b10
b10 _ # r b11
b11 _ # r b12
b12 _ # r b13
b13 _ # r b14
b14 _ # r b15
b15 _ # r b16
b16 _ # r b17
b17 _ # r b18
b18 _ # r b19
b19 _ # u re1

; --- Right edge: col 19, rows 1→7 ---
re1 _ # u re2
re2 _ # u re3
re3 _ # u re4
re4 _ # u re5
re5 _ # u re6
re6 _ # u re7
re7 _ # l tp18

; --- Top border: row 7, cols 18→0 ---
tp18 _ # l tp17
tp17 _ # l tp16
tp16 _ # l tp15
tp15 _ # l tp14
tp14 _ # l tp13
tp13 _ # l tp12
tp12 _ # l tp11
tp11 _ # l tp10
tp10 _ # l tp9
tp9 _ # l tp8
tp8 _ # l tp7
tp7 _ # l tp6
tp6 _ # l tp5
tp5 _ # l tp4
tp4 _ # l tp3
tp3 _ # l tp2
tp2 _ # l tp1
tp1 _ # l tp0
tp0 _ # d le6

; --- Left edge: col 0, rows 6→1 ---
le6 _ # d le5
le5 _ # d le4
le4 _ # d le3
le3 _ # d le2
le2 _ # d le1
le1 _ # r nav0

; --- Navigate to blinker at (4,9) ---
nav0 _ _ u nav1
nav1 _ _ u nav2
nav2 _ _ r nav3
nav3 _ _ r nav4
nav4 _ _ r nav5
nav5 _ _ r nav6
nav6 _ _ r nav7
nav7 _ _ r nav8
nav8 _ _ r nav9
nav9 _ _ r nav10
nav10 _ _ r nav11

; --- Place blinker: row 4, cols 9-11 ---
nav11 _ 1 r nav12
nav12 _ 1 r nav13
nav13 _ 1 * halt
