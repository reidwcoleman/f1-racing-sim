# F1 Racing Simulator

A realistic Formula 1 racing game built with Three.js, featuring advanced graphics, realistic physics, and immersive gameplay.

## Features

### Graphics
- **High-quality 3D rendering** with Three.js
- **Realistic lighting** with directional shadows, ambient light, and hemisphere lighting
- **Post-processing effects** with tone mapping and anti-aliasing
- **Detailed F1 car model** with custom geometry, sponsors, and racing numbers
- **Dynamic particle system** for smoke and dust effects
- **Tire marks** and skid effects
- **Environmental details** including trees, grandstands, pit lane, and clouds

### Physics
- **Realistic car dynamics** powered by Cannon.js physics engine
- **Downforce simulation** that increases with speed
- **Authentic gear system** with 7-speed transmission
- **Weight distribution** matching real F1 cars (740kg minimum weight)
- **Friction and traction simulation**
- **Collision detection** with track barriers

### Racing Features
- **Multiple camera modes**: Chase, Cockpit, and Cinematic views
- **Live HUD display**:
  - Speedometer (km/h)
  - Gear indicator
  - RPM gauge with color-coded zones
  - Lap timer with best lap tracking
  - Position indicator
  - Mini-map with car position
- **Dynamic track** with curves, barriers, and curbs
- **Start/finish line** with checkered pattern
- **Marshal posts** and track signage

### Audio
- **Procedural engine sound** using Web Audio API
- **RPM-based audio modulation**
- **Collision and skid sound effects**
- **Dynamic volume based on throttle input**

### Controls
- **Keyboard support**:
  - W / Arrow Up: Accelerate
  - S / Arrow Down: Brake / Reverse
  - A / Arrow Left: Turn Left
  - D / Arrow Right: Turn Right
  - C: Change Camera
  - R: Reset Car

- **Gamepad support**:
  - RT (Right Trigger): Accelerate
  - LT (Left Trigger): Brake
  - Left Stick: Steering
  - A Button: Alternative Accelerate
  - B Button: Alternative Brake

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd f1-racing-sim
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open your browser and navigate to the URL shown in the terminal (typically http://localhost:5173)

## Building for Production

To create a production build:
```bash
npm run build
```

To preview the production build:
```bash
npm run preview
```

## Technologies Used

- **Three.js** (v0.160.0) - 3D graphics library
- **Cannon-es** (v0.20.0) - Physics engine
- **Vite** (v5.0.0) - Build tool and development server
- **Web Audio API** - Procedural sound generation

## Project Structure

```
f1-racing-sim/
├── index.html          # Main HTML file with HUD elements
├── style.css           # Styling for UI and HUD
├── main.js             # Main game class and initialization
├── f1car.js            # F1 car model and physics
├── track.js            # Racing track generation
├── controller.js       # Input handling (keyboard/gamepad)
├── hud.js              # HUD display and race timing
├── effects.js          # Visual effects (particles, tire marks)
├── audio.js            # Audio system for engine sounds
├── package.json        # Project dependencies
└── README.md           # This file
```

## Performance Tips

- For best performance, use a modern browser (Chrome, Firefox, Edge)
- The game automatically adjusts pixel ratio for optimal performance
- Reduce browser window size if experiencing low FPS
- Close other applications to free up GPU resources

## Future Enhancements

Potential features for future updates:
- AI opponents for competitive racing
- Multiple tracks (Monaco, Silverstone, Spa)
- Weather effects (rain, wet track)
- Damage system
- Replay system
- Multiplayer support
- Customizable car liveries
- Advanced telemetry data

## License

MIT License

## Credits

Created with Three.js and Cannon-es physics engine.
