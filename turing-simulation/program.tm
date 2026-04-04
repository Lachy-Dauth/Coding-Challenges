; a^n b^m a^(2n) b^m - initial checks
; n=0 (pure b's → b^2k), m=0 (pure a's → a^3k), then format a^x b^y a^z b^v
; checks for a^n b^y a^2n b^v
; checks for a^n b^m a^2n b^m

; Syntax: A are marked a's and B are marked b's.

; a0 a1 a2 ret all check if the string is a^3k or is a^n for n != 3k or includes b's

a0 a a r a1
a0 b b * ret
a0 _ _ * halt-accept

a1 a a r a2
a1 b b * ret
a1 _ _ * halt-reject

a2 a a r a0
a2 b b * ret
a2 _ _ * halt-reject

ret _ _ r b0
ret * * l ret

; b0 b1 and fret check if the string is b^2k or b^2k+1 or includes a's

b0 b b r b1
b0 a a * fret
b0 _ _ * halt-accept

b1 b b r b0
b1 a a * fret
b1 _ _ * halt-reject

fret _ _ r f0
fret * * l fret

; f0 f1 f2 f3 f4 check if the string is in the format a^x b^y a^z b^v

; starts with a
f0 a a r f1
f0 b b * halt-reject

; switch to b's
f1 a a r f1
f1 b b r f2
f1 _ _ * halt-reject

; switch to a's
f2 b b r f2
f2 a a r f3
f2 _ _ * halt-reject

; switch to b's
f3 a a r f3
f3 b b r f4
f3 _ _ * halt-reject

; ends with b's only
f4 b b r f4
f4 a a * halt-reject
f4 _ _ l 1ret

1ret _ _ r acheck
1ret A A r acheck
1ret * * l 1ret

; deletes one a goes across to the next a and deletes 2 a's, repeat

acheck a A r atraverse
acheck b b * checka

atraverse a a r atraverse
atraverse b b * adelete

adelete a A r adelete2
adelete b b r adelete
adelete A A r adelete

adelete2 a A l 2ret
adelete2 b b * halt-reject

checka a a * halt-reject
checka b b r checka
checka A A r checka
checka _ _ l delrb

2ret A A l 2ret
2ret b b l 1ret
2ret a a l 1ret

; deletes one b goes across to the next b and deletes one b, repeat

delrb b B l bleft
delrb A A l checklb

bleft b b l bleft
bleft A A l Aleft

Aleft A A l Aleft
Aleft b b l bleft2
Aleft B B l halt-reject

bleft2 b b l bleft2
bleft2 A A r dellb
bleft2 B B r dellb

dellb b B r bright
dellb A A * halt-reject

bright b b r bright
bright A A r Aright

Aright A A r Aright
Aright b b r bright2
Aright B B l checknob

bright2 b b r bright2
bright2 _ _ l delrb
bright2 B B l delrb

checknob b b * halt-reject
checknob A A l checknob
checknob _ _ * halt-accept
checknob B B l checknob
