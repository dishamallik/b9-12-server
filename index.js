const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://b9-12-client.web.app",
      "https://b9-12-client.firebaseapp.com",
    ],
  })
);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1qpflqd.mongodb.net`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const userCollection = client.db("scholarship").collection("users");
    const menuCollection = client.db("scholarship").collection("menu");
    const paymentCollection = client.db("scholarship").collection("payments");
    const applicationCollection = client.db("scholarship").collection("applications"); // New collection

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyRole = async (req, res, next, role) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });
      if (user?.role !== role) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      next();
    };

    const verifyAdmin = (req, res, next) => {
      verifyRole(req, res, next, 'admin');
    };

    const verifyModerator = (req, res, next) => {
      verifyRole(req, res, next, 'moderator');
    };

    app.get('/users', verifyToken, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const existingUser = await userCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch('/users/moderator/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: 'moderator' } }
      );
      res.send(result);
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: 'admin' } }
      );
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const user = await userCollection.findOne({ email });
      res.send({ admin: user?.role === 'admin' });
    });

    app.get('/users/moderator/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const user = await userCollection.findOne({ email });
      res.send({ moderator: user?.role === 'moderator' });
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });

    app.post('/menu', verifyToken, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.delete('/menu/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;

      if (!price || isNaN(price)) {
        res.status(400).send({ error: 'Invalid price provided' });
        return;
      }

      const amount = Math.round(price * 100);

      console.log(`Creating payment intent for amount: ${amount} cents`);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card']
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).send({ error: 'Error creating payment intent' });
      }
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });




    // New endpoint for application submission
    app.post('/apply-scholarship', async (req, res) => {
      const application = req.body;
      const result = await applicationCollection.insertOne(application);
      res.send(result);
    });

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      res.send(paymentResult);
    });

// 
// 

    app.get('/applications', async (req, res) => {
      const applications = await applicationCollection.find().toArray();
      res.send(applications);
  });
  






    // await client.db("scholarship").command({ ping: 1 });
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Scholarship server is running');
});

app.listen(port, () => {
  console.log(`Scholarship server is running on port ${port}`);
});
