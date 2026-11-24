const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://assignmentnpm8.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    const db = client.db('studiospaceDB');
    const studiosCollection = db.collection('studios');
    const bookingsCollection = db.collection('bookings');

    // --- AUTH / JWT ENDPOINTS ---
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true, token });
    });

    app.post('/logout', async (req, res) => {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // --- STUDIOS CRUD ENDPOINTS ---
    // Get all studios (with optional category & search filter)
    app.get('/studios', async (req, res) => {
      const { category, search, limit } = req.query;
      let query = {};
      if (category && category !== 'All') {
        query.category = category;
      }
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { location: { $regex: search, $options: 'i' } }
        ];
      }
      let cursor = studiosCollection.find(query);
      if (limit) {
        cursor = cursor.limit(parseInt(limit));
      }
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get featured 6 studios
    app.get('/studios/featured', async (req, res) => {
      const result = await studiosCollection.find().limit(6).toArray();
      res.send(result);
    });

    // Get single studio details
    app.get('/studios/:id', async (req, res) => {
      const id = req.params.id;
      const result = await studiosCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Get studios listed by a specific host email
    app.get('/my-listings/:email', async (req, res) => {
      const email = req.params.email;
      const result = await studiosCollection.find({ hostEmail: email }).toArray();
      res.send(result);
    });

    // Add a new studio
    app.post('/studios', async (req, res) => {
      const newStudio = req.body;
      newStudio.createdAt = new Date();
      const result = await studiosCollection.insertOne(newStudio);
      res.send(result);
    });

    // Update a studio
    app.patch('/studios/:id', async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      delete updatedData._id;
      const result = await studiosCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // Delete a studio
    app.delete('/studios/:id', async (req, res) => {
      const id = req.params.id;
      const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // --- BOOKINGS & DOUBLE-BOOKING PREVENTION ---
    app.get('/bookings/:email', async (req, res) => {
      const email = req.params.email;
      const result = await bookingsCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    app.post('/bookings', async (req, res) => {
      const booking = req.body;

      // Double-Booking Check: Prevent if an active/confirmed booking exists for same studio & date
      const existingBooking = await bookingsCollection.findOne({
        studioId: booking.studioId,
        date: booking.date,
        status: { $in: ['Pending', 'Confirmed'] }
      });

      if (existingBooking) {
        return res.status(409).send({
          success: false,
          message: 'This studio is already booked for the selected date!'
        });
      }

      booking.status = 'Pending';
      booking.createdAt = new Date();
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.patch('/bookings/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    app.delete('/bookings/:id', async (req, res) => {
      const id = req.params.id;
      const result = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

  } finally {
    // Keep connection open for serverless reuse
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('StudioSpace Server is running smoothly!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;