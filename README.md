# Melty Karts

A fast-paced, competitive 3D racing game built with Web technologies, featuring real-time rollback netcode, character selection, and multiplayer support.

[Demo](https://clinuxrulz.github.io/melty-karts/)

## Features

- 🏎️ **3D Kart Racing** - Fast-paced arcade-style racing with physics-based controls
- 👥 **Multiplayer Support** - Play with friends locally or online
- 🔄 **Real-time Rollback Netcode** - Zero-latency multiplayer through advanced networking
- 👤 **Character Selection** - Choose from multiple playable characters (Cubey, Melty, Solid)
- 🎮 **Multiple Input Methods** - Keyboard, gamepad, and touch controls
- 🎯 **Physics-Based Gameplay** - Drifting, boosting, and collision mechanics

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/clinuxrulz/melty-karts.git
cd melty-karts
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm run dev
```

4. Open your browser to `http://localhost:5173` (or the port shown in the terminal)

### Building for Production

```bash
pnpm run build
pnpm run serve
```

## Controls

### Keyboard
- **Space** - Accelerate
- Release **Space** - Brake
- **Left/Right** - Steer

### Touch
- **Virtual Button** - Accelerate
- Release **Virtual Button** - Brake
- **Virtual Joystic** - Steer

## Project Structure

```
melty-karts/
├── apps/
│   └── melty-karts/          # Main game application
│       ├── src/
│       │   ├── models/       # 3D models and geometry
│       │   ├── systems/      # Game logic systems
│       │   └── components.ts # ECS components
│       └── package.json
├── packages/
│   └── reactive-ecs/         # Reactive ECS library
└── package.json
```

## Technical Stack

- **WebGL** - Hardware-accelerated 3D graphics via Three.js
- **Reactive ECS** - Entity-Component-System architecture
- **Solid.js** - Reactive UI framework
- **TypeScript** - Type-safe development
- **pnpm** - Fast, disk-efficient package manager

## Development

The game uses a custom ECS (Entity-Component-System) architecture for performance:
- Entities have unique identifiers
- Components are data-only structures
- Systems process components based on queries
- Components are synchronized for rollback netcode

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Teck Stack

- Built with [Three.js](https://threejs.org/)
- Uses [Solid.js](https://solidjs.com/) for reactive UI
- Reactive ECS implementation
