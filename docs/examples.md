# Example Usage

Once [configured](clients.md), you can interact with ZEsarUX naturally:

```
You: Reset the Spectrum and set it to 128K mode
Claude: [Uses reset_machine, then set_machine with "spectrum128"]

You: What's at memory address 4000?
Claude: [Uses peek tool] "The first 256 bytes of the screen RAM..."

You: Set a breakpoint at address 8000
Claude: [Uses set_breakpoint] "Breakpoint set at 8000"

You: Load this tape file: /games/jetpac.tap
Claude: [Uses load_file] "Loading tape file..."
```

## Quick tool-call examples

```json
// Reset and set machine
{"name": "reset_machine"}
{"name": "set_machine", "arguments": {"machine": "spectrum128"}}

// Read/write memory
{"name": "peek", "arguments": {"address": "4000", "length": 256}}
{"name": "poke", "arguments": {"address": "4000", "value": [255, 0]}}

// Debugging
{"name": "get_registers"}
{"name": "set_breakpoint", "arguments": {"address": "8000"}}

// Load tape
{"name": "load_file", "arguments": {"filename": "/path/game.tap"}}
```

See [Available Tools](tools.md) for the full reference of every tool and its parameters.
