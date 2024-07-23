const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Middleware
app.use(cors({
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: 'localhost:3001',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

const rooms = {};

app.get('/getRoom', (req, res) => {
    const roomId = uuidv4();
    rooms[roomId] = { files: {} }; // Store files as a dictionary by fileName
    res.json({ roomId });
});

app.get('/files/:roomId', (req, res) => {
    const { roomId } = req.params;
    if (rooms[roomId]) {
        const files = Object.values(rooms[roomId].files);
        res.json(files);
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    socket.on('FILE_CHUNK', (data) => {
        const { roomId, chunk, fileName, fileSize, chunkIndex } = data;

        if (!rooms[roomId]) {
            rooms[roomId] = { files: {} };
        }

        if (!rooms[roomId].files[fileName]) {
            rooms[roomId].files[fileName] = { fileName, fileSize, receivedSize: 0, chunks: [] };
        }

        let file = rooms[roomId].files[fileName];
        file.chunks[chunkIndex] = chunk;
        file.receivedSize += chunk.byteLength;
        console.log(`File progress: ${file.receivedSize} / ${file.fileSize}`);

        console.log(rooms[roomId].files[fileName]);  // Log the file to debug
        console.log(file.receivedSize === fileSize);  // Check if file received completely

        if (file.receivedSize === fileSize) {
            const blob = new Blob(file.chunks);
            const url = URL.createObjectURL(blob);
            io.to(roomId).emit('FILE_RECEIVED', { fileName, url });
        }

        console.log(`Received chunk ${chunkIndex} for file ${fileName} in room ${roomId}`);
    });

    socket.on('JOIN_ROOM', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
        io.to(roomId).emit('userJoined', { message: `User ${socket.id} joined room ${roomId}` });
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
    });
});

server.listen(PORT, () => {
    console.log('Server listening to PORT:', PORT);
});
