export class HUD {
    constructor() {
        this.speedElement = document.getElementById('speed');
        this.gearElement = document.getElementById('gear');
        this.currentLapElement = document.getElementById('current-lap-time');
        this.bestLapElement = document.getElementById('best-lap-time');
        this.currentLapNumber = document.getElementById('current-lap');
        this.totalLaps = document.getElementById('total-laps');
        this.positionElement = document.getElementById('position');

        this.rpmCanvas = document.getElementById('rpm-canvas');
        this.rpmCtx = this.rpmCanvas.getContext('2d');

        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        // Race timing
        this.raceStartTime = null;
        this.lapStartTime = null;
        this.currentLapTime = 0;
        this.bestLapTime = null;
        this.currentLap = 1;
        this.totalLapsCount = 5;

        this.initializeRPMGauge();
        this.initializeMinimap();
    }

    startRace() {
        this.raceStartTime = Date.now();
        this.lapStartTime = Date.now();
        this.totalLaps.textContent = this.totalLapsCount;
    }

    update(car) {
        if (!car) return;

        // Update speed
        const speed = Math.round(car.getSpeed());
        this.speedElement.textContent = speed;

        // Update gear
        this.gearElement.textContent = car.getGear();

        // Update RPM gauge
        this.updateRPMGauge(car.getRPM());

        // Update lap time
        if (this.lapStartTime) {
            this.currentLapTime = Date.now() - this.lapStartTime;
            this.currentLapElement.textContent = this.formatTime(this.currentLapTime);
        }

        // Update minimap
        this.updateMinimap(car.getPosition());
    }

    initializeRPMGauge() {
        this.rpmCtx.strokeStyle = '#333';
        this.rpmCtx.lineWidth = 2;
    }

    updateRPMGauge(rpm) {
        const ctx = this.rpmCtx;
        const width = this.rpmCanvas.width;
        const height = this.rpmCanvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, width, height);

        // RPM range: 1000-15000
        const minRPM = 1000;
        const maxRPM = 15000;
        const normalizedRPM = (rpm - minRPM) / (maxRPM - minRPM);

        // Draw RPM bars
        const barCount = 20;
        const barWidth = (width - 10) / barCount;

        for (let i = 0; i < barCount; i++) {
            const barHeight = height - 20;
            const x = 5 + i * barWidth;
            const y = height - 10;

            if (i / barCount <= normalizedRPM) {
                // Color based on RPM level
                if (i < barCount * 0.7) {
                    ctx.fillStyle = '#00ff00'; // Green
                } else if (i < barCount * 0.85) {
                    ctx.fillStyle = '#ffff00'; // Yellow
                } else {
                    ctx.fillStyle = '#ff0000'; // Red (danger zone)
                }
            } else {
                ctx.fillStyle = '#333333';
            }

            ctx.fillRect(x, y - barHeight * 0.8, barWidth - 2, barHeight * 0.8);
        }

        // Draw RPM value
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(rpm)} RPM`, width / 2, 15);
    }

    initializeMinimap() {
        this.minimapCtx.strokeStyle = '#ffffff';
        this.minimapCtx.lineWidth = 2;
    }

    updateMinimap(carPosition) {
        const ctx = this.minimapCtx;
        const width = this.minimapCanvas.width;
        const height = this.minimapCanvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Draw track outline (simplified)
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2);
        ctx.stroke();

        // Draw track surface
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2);
        ctx.stroke();

        // Draw car position
        const scale = 0.4;
        const centerX = width / 2;
        const centerY = height / 2;
        const carX = centerX + carPosition.x * scale;
        const carY = centerY + carPosition.z * scale;

        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(carX, carY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw direction indicator
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(carX, carY);
        ctx.lineTo(carX, carY - 8);
        ctx.stroke();
    }

    completeLap() {
        // Record lap time
        if (this.currentLapTime > 0) {
            if (this.bestLapTime === null || this.currentLapTime < this.bestLapTime) {
                this.bestLapTime = this.currentLapTime;
                this.bestLapElement.textContent = this.formatTime(this.bestLapTime);
            }
        }

        // Increment lap
        this.currentLap++;
        this.currentLapNumber.textContent = this.currentLap;

        // Reset lap timer
        this.lapStartTime = Date.now();

        // Check if race is complete
        if (this.currentLap > this.totalLapsCount) {
            this.endRace();
        }
    }

    endRace() {
        console.log('Race complete!');
        // Could show end race screen here
    }

    formatTime(milliseconds) {
        const totalSeconds = milliseconds / 1000;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const ms = Math.floor((milliseconds % 1000) / 10);

        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }

    setTotalLaps(laps) {
        this.totalLapsCount = laps;
        this.totalLaps.textContent = laps;
    }
}
