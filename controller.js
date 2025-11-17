export class GameController {
    constructor(car) {
        this.car = car;
        this.keys = {};
        this.gamepadIndex = null;
        this.deadzone = 0.15;

        this.setupKeyboardControls();
        this.setupGamepadControls();
        this.startInputLoop();
    }

    setupKeyboardControls() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    setupGamepadControls() {
        window.addEventListener('gamepadconnected', (e) => {
            console.log('Gamepad connected:', e.gamepad);
            this.gamepadIndex = e.gamepad.index;
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('Gamepad disconnected');
            if (this.gamepadIndex === e.gamepad.index) {
                this.gamepadIndex = null;
            }
        });
    }

    startInputLoop() {
        const updateInput = () => {
            const input = this.getInput();
            if (this.car) {
                this.car.handleInput(input);
            }
            requestAnimationFrame(updateInput);
        };
        updateInput();
    }

    getInput() {
        let forward = false;
        let backward = false;
        let left = false;
        let right = false;

        // Keyboard input
        if (this.keys['w'] || this.keys['arrowup']) {
            forward = true;
        }
        if (this.keys['s'] || this.keys['arrowdown']) {
            backward = true;
        }
        if (this.keys['a'] || this.keys['arrowleft']) {
            left = true;
        }
        if (this.keys['d'] || this.keys['arrowright']) {
            right = true;
        }

        // Gamepad input
        if (this.gamepadIndex !== null) {
            const gamepad = navigator.getGamepads()[this.gamepadIndex];
            if (gamepad) {
                // Right trigger (RT) for acceleration
                if (gamepad.buttons[7] && gamepad.buttons[7].value > this.deadzone) {
                    forward = true;
                }

                // Left trigger (LT) for braking
                if (gamepad.buttons[6] && gamepad.buttons[6].value > this.deadzone) {
                    backward = true;
                }

                // Left stick horizontal axis for steering
                const steerAxis = gamepad.axes[0];
                if (Math.abs(steerAxis) > this.deadzone) {
                    if (steerAxis < 0) {
                        left = true;
                    } else {
                        right = true;
                    }
                }

                // Alternative: Face buttons
                // A button (index 0) for acceleration
                if (gamepad.buttons[0] && gamepad.buttons[0].pressed) {
                    forward = true;
                }

                // B button (index 1) for braking
                if (gamepad.buttons[1] && gamepad.buttons[1].pressed) {
                    backward = true;
                }
            }
        }

        return { forward, backward, left, right };
    }

    getGamepadInfo() {
        if (this.gamepadIndex !== null) {
            const gamepad = navigator.getGamepads()[this.gamepadIndex];
            if (gamepad) {
                return {
                    id: gamepad.id,
                    buttons: gamepad.buttons.length,
                    axes: gamepad.axes.length
                };
            }
        }
        return null;
    }
}
