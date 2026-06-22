# Example Usage

Once [configured](clients.md), you can interact with ZEsarUX naturally:

```
You: Reset the Spectrum and set it to 128K mode
Claude: [Uses reset_machine, then set_machine with "128k"]

You: What's at memory address 4000?
Claude: [Uses peek tool] "The first 256 bytes of the screen RAM..."

You: Set a breakpoint when the CPU reaches address 8000
Claude: [Uses set_breakpoint with slot index 0 and type "execute"] "Breakpoint set in slot 0 (PC=8000)"

You: Load this tape file: /games/jetpac.tap
Claude: [Uses load_file] "Smartloading the file..."
```

## Quick tool-call examples

```json
// Reset and set machine
{"name": "reset_machine"}
{"name": "set_machine", "arguments": {"machine": "128k"}}

// Read/write memory
{"name": "peek", "arguments": {"address": "4000", "length": 256}}
{"name": "poke", "arguments": {"address": "4000", "value": [255, 0]}}

// Debugging
{"name": "get_registers"}
// Break when PC reaches 8000 (slot index is required)
{"name": "set_breakpoint", "arguments": {"index": 0, "type": "execute", "address": "8000"}}
// Or pass a raw condition expression directly
{"name": "set_breakpoint", "arguments": {"index": 1, "condition": "PC=8000"}}

// Load a file (smartload auto-detects the type)
{"name": "load_file", "arguments": {"filename": "/path/game.tap"}}
```

See [Available Tools](tools.md) for the full reference of every tool and its parameters.
