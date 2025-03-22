import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import indexRoutes from "./routes/index.js";

const app = express();
const port = 8080;

app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  })
);


app.use(express.json({ limit: '10mb' })); 

// Connect to MongoDB
connectDB();

// Import routes
app.use("/", indexRoutes);

app.get("/test", (req, res) => {
  console.log("done");
  return res.send("done");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
