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
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "Payload too large" });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ message: "Invalid JSON body" });
  }
  next(err);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

