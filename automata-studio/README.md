# Automata Studio

A browser-based automata simulator built for enjoyment and as a study aid for **COMP4141** (Theory of Computation), inspired by the MIT 18.404J course.

**[Launch Automata Studio](https://lachy-dauth.github.io/Coding-Challenges/automata-studio/)**

## Supported Automata

| Type | Status |
|------|--------|
| DFA (Deterministic Finite Automaton) | Supported |
| NFA (Nondeterministic Finite Automaton) | Supported |
| GNFA (Generalised NFA) | Supported |
| PDA (Pushdown Automaton) | Supported |
| Turing Machine | Supported |
| CFG (Context-Free Grammar) | Supported |

## Features

- **GNFA Conversion**: Convert DFAs and NFAs to GNFAs. GNFAs can also be converted into regular expressions through state elimination.
- **NFA → DFA**: Convert NFAs into equivalent DFAs using the subset construction algorithm.
- **Regex → NFA**: Convert a regular expression into an NFA using Thompson's construction (supports `|`, `*`, `+`, `?`, `()`, `ε`).
- **DFA Minimisation**: Reduce any DFA to its minimal equivalent using the table-filling (Myhill-Nerode) algorithm.
- **CFG → CNF**: Step-by-step Chomsky Normal Form conversion.
- **Undo / Redo**: Full undo/redo history per automata type — Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z).
- **Keyboard Shortcuts**: `A` = Add mode · `S` = Select mode · `Delete` = remove selected state · `←/→` = step through simulation.
- **Step-by-step Simulation**: Animate computation on DFA, NFA, PDA, and Turing Machine with forward/back stepping.
- **Sharing**: Export your automata as shareable links.
- **LaTeX Export**: Generate TikZ diagrams and formal tuple notation ready for COMP4141 write-ups.
