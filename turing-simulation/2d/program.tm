; Copy input from row 0 up to row 1
; Supported alphabet: 0, 1
; Input is placed on row 0; copy appears on row 1 with markers left on row 0

; Read character and mark it, go up to write
copy 0 X u w0
copy 1 Y u w1
copy _ _ * halt       ; blank = done

; Write on row 1, return down
w0 _ 0 d next
w1 _ 1 d next

; Move right to next character
next * * r copy
