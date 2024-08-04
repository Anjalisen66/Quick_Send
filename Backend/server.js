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
        origin: 'http://localhost:3001',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

const rooms = {};

// API to create a new room
app.get('/getRoom', (req, res) => {
    const roomId = uuidv4();
    rooms[roomId] = { files: {} }; // Store files as a dictionary by fileName
    res.json({ roomId });
});

// API to get files by roomId
app.get('/files/:roomId', (req, res) => {
    const { roomId } = req.params;
    if (rooms[roomId]) {
        const files = Object.values(rooms[roomId].files);
        res.json(files);
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Handle file chunk event
    socket.on('FILE_CHUNK', (data, callback) => {
        const { roomId, chunk, fileName, fileSize, chunkIndex } = data;

        if (!rooms[roomId]) {
            rooms[roomId] = { files: {} };
        }

        if (!rooms[roomId].files[fileName]) {
            rooms[roomId].files[fileName] = { 
                fileName, 
                fileSize, 
                receivedSize: 0, 
                chunks: [],
                expectedChunkIndex: 0 // Initialize expected chunk index
            };
        }

        let file = rooms[roomId].files[fileName];

        // Check if the received chunk is in the correct order
        if (chunkIndex !== file.expectedChunkIndex) {
            console.error(`Expected chunk index ${file.expectedChunkIndex}, but received ${chunkIndex}. Dropping chunk.`);
            callback({ status: 'error', message: `Chunk ${chunkIndex} out of order. Expected ${file.expectedChunkIndex}.` });
            return;
        }

        file.chunks[chunkIndex] = chunk;
        file.receivedSize += chunk.byteLength;
        file.expectedChunkIndex++; // Increment expected chunk index
        console.log(`File progress: ${file.receivedSize} / ${file.fileSize}`);

        // Notify the sender and receiver about the progress
        io.to(roomId).emit('FILE_PROGRESS', { fileName, receivedSize: file.receivedSize, fileSize: file.fileSize });

        if (file.receivedSize === fileSize) {
            // Emit FILE_RECEIVED event
            io.to(roomId).emit('FILE_RECEIVED', { fileName });

            // Optionally, create a URL for the blob and send it
            const blob = new Blob(file.chunks);
            const url = URL.createObjectURL(blob);
            io.to(roomId).emit('FILE_RECEIVED_URL', { fileName, url });

            // Revoke URL after some time to free memory
            setTimeout(() => URL.revokeObjectURL(url), 60000); // Adjust timeout as needed
        }

        console.log(`Received chunk ${chunkIndex} for file ${fileName} in room ${roomId}`);

        // Send acknowledgment to the client
        callback({ status: 'ok', chunkIndex });
    });

    // Handle room join event
    socket.on('JOIN_ROOM', (roomId) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            console.log(`User ${socket.id} joined room ${roomId}`);
            io.to(roomId).emit('userJoined', { message: `User ${socket.id} joined room ${roomId}` });
        } else {
            socket.emit('error', { message: 'Room not found' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
    });
});

server.listen(PORT, () => {
    console.log('Server listening on PORT:', PORT);
});
