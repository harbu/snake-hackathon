const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = {};
const food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };

const colors = ['green', 'blue', 'orange', 'yellow', 'pink', 'purple', 'cyan', 'lime', 'teal'];

app.use(express.static('public'));

function getRandomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
}

function broadcast(data, exclude) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function playerDied(id) {
    const player = players[id];
    if (player) {
        console.log(`Player ${id} died!`);
        player.alive = false;
        player.score = 0;
        player.tail = [];
        broadcast({ type: 'playerDied', id });
    }
}

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substr(2, 9);
    console.log(`Player connected: ${id}`);

    // Randomize starting position
    const startX = Math.floor(Math.random() * 20);
    const startY = Math.floor(Math.random() * 20);

    players[id] = {
        x: startX,
        y: startY,
        dx: 1,
        dy: 0,
        tail: [],
        score: 0,
        color: getRandomColor(),
        alive: true
    };

    ws.send(JSON.stringify({ type: 'init', players, food, id }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'move') {
            const player = players[id];
            if (player && player.alive) {
                if (data.direction === 'up' && player.dy === 0) { player.dx = 0; player.dy = -1; }
                if (data.direction === 'down' && player.dy === 0) { player.dx = 0; player.dy = 1; }
                if (data.direction === 'left' && player.dx === 0) { player.dx = -1; player.dy = 0; }
                if (data.direction === 'right' && player.dx === 0) { player.dx = 1; player.dy = 0; }
            }
        } else if (data.type === 'rejoin') {
            const player = players[id];
            if (player) {
                player.dx = 1;
                player.dy = 0;
                player.tail = [];
                player.score = 0;
                player.alive = true;
                broadcast({ type: 'newPlayer', id, position: player });
            }
        }
    });

    ws.on('close', () => {
        console.log(`Player disconnected: ${id}`);
        delete players[id];
        broadcast({ type: 'removePlayer', id });
    });
});

setInterval(() => {
    for (const id in players) {
        const player = players[id];
        if (!player.alive) continue;

        player.x += player.dx;
        player.y += player.dy;

        // Handle wrapping
        if (player.x < 0) player.x = 19;
        if (player.x >= 20) player.x = 0;
        if (player.y < 0) player.y = 19;
        if (player.y >= 20) player.y = 0;

        // Check for self-collision
        if (player.tail.some(segment => segment.x === player.x && segment.y === player.y)) {
            playerDied(id);
            continue;
        }

        // Check for collisions with other players
        for (const otherId in players) {
            if (id !== otherId) {
                const otherPlayer = players[otherId];
                if (player.x === otherPlayer.x && player.y === otherPlayer.y) {
                    playerDied(id);
                    continue;
                }
                if (otherPlayer.tail.some(segment => segment.x === player.x && segment.y === player.y)) {
                    playerDied(id);
                    continue;
                }
            }
        }

        // Check for food
        if (player.x === food.x && player.y === food.y) {
            player.tail.push({ x: player.x, y: player.y });
            player.score++;
            food.x = Math.floor(Math.random() * 20);
            food.y = Math.floor(Math.random() * 20);
        }

        // Update tail
        if (player.tail.length > 0) {
            player.tail.pop();
            player.tail.unshift({ x: player.x, y: player.y });
        }
    }

    broadcast({ type: 'update', players, food });
}, 100);

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
