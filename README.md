# Coding Challenges

A collection of self-contained browser-based projects. Live at **[lachy-dauth.github.io/Coding-Challenges](https://lachy-dauth.github.io/Coding-Challenges/)**.

---

## Projects

### Tic Tac Toe — 4 variants
[lachy-dauth.github.io/Coding-Challenges/tic-tac-toe](https://lachy-dauth.github.io/Coding-Challenges/tic-tac-toe/)

| Variant | Description |
|---|---|
| [Classic](https://lachy-dauth.github.io/Coding-Challenges/tic-tac-toe/classic/) | Minimax AI — plays a provably perfect game, never blunders |
| [Easy Mode](https://lachy-dauth.github.io/Coding-Challenges/tic-tac-toe/easy-mode/) | One-ply greedy AI — looks one move ahead, no threat detection |
| [Baby Mode](https://lachy-dauth.github.io/Coding-Challenges/tic-tac-toe/baby-mode/) | Handicapped AI — deliberately plays suboptimal moves |
| [2 Player](https://lachy-dauth.github.io/Coding-Challenges/tic-tac-toe/2-player/) | Local pass-and-play, no AI |

---

### Boids
[lachy-dauth.github.io/Coding-Challenges/boids](https://lachy-dauth.github.io/Coding-Challenges/boids/)

Craig Reynolds' 1987 flocking algorithm. Three local rules applied to each agent independently:

- **Separation** — avoid crowding neighbours
- **Alignment** — steer toward the average heading of neighbours
- **Cohesion** — steer toward the average position of neighbours

Complex collective motion emerges with no central coordination.

---

### Turing Machine Simulator
[lachy-dauth.github.io/Coding-Challenges/turing-simulation](https://lachy-dauth.github.io/Coding-Challenges/turing-simulation/)

Write transition rules in a plain-text format, load a tape, and step through execution.

**Rule format:** `state symbol new-symbol direction new-state`

```
; Increment a binary number
0 _ _ r halt
0 * * r 0       ; scan right to end
0 _ _ l 1

1 1 0 l 1       ; flip 1→0, carry
1 0 1 * halt    ; flip 0→1, done
1 _ 1 * halt    ; leading bit
```

**Features:**
- `*` wildcard matches any state or symbol
- `_` represents blank
- `!` at the end of a rule line sets a breakpoint
- Append `!` to a rule to pause execution on that transition
- Shareable URLs — the full program is compressed and encoded in the fragment, no server needed
- Automated test suite with pattern-based tape generation (e.g. `a^n b^m`)
