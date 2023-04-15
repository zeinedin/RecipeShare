require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const session = require('express-session');
const flash = require("express-flash");
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const app = express();
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: false }));
app.use(flash());
app.use(express.static("public"));
const PORT = process.env.PORT || 3000;
app.use(session({
    secret: 'login upload',
    resave: false,
    saveUninitialized: false,
  }));
app.use(passport.initialize());
app.use(passport.session());
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB Connected.");
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

const recipeSchema = new mongoose.Schema({
  title: String,
  image: {
    data: Buffer,
    contentType: String,
  },
  imageLink: String,
  description: String,
  ingredients: String,
  instructions: String,
});

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
});

const loginSchema = new mongoose.Schema({
    email: String,
    password: String,
    googleId: String
});

loginSchema.plugin(passportLocalMongoose);
loginSchema.plugin(findOrCreate);

const Recipe = mongoose.model("Recipe", recipeSchema);
const User = mongoose.model("User", userSchema);
const Login = mongoose.model("Login", loginSchema);

passport.use( Login.createStrategy());
passport.serializeUser((user, done) => {
  process.nextTick(() => {
    done(null, { id: user._id, email: user.email }); })
  })
passport.deserializeUser((user, done) => {
  process.nextTick(() => {
    done(null, user);
  });
});

passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/google/upload"
},
function(accessToken, refreshToken, profile, cb) {
  Login.findOrCreate({ googleId: profile.id }, function (err, user) {
    return cb(err, user);
  });
}
));

// configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/uploads/");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});
const upload = multer({ storage: storage, limits: { fileSize: 1024 * 1024 * 5 }});

//configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.get("/", (req, res) => {
  res.render("home", { path: "/" });
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] }
));

app.get('/auth/google/upload', 
  passport.authenticate('google', { failureRedirect: '/signin' }),
  function(req, res) {
    // Successful authentication, redirect secrets.
    res.redirect('/upload');
});

app.get('/signin', (req, res) => {
  res.render('signin' ,{path: "/signin" });
})

app.get('/register', (req, res) => {
  res.render('register',{path: "/register" });
})

app.get("/about", (req, res) => {
  res.render("about", { path: "/about" });
});

app.get("/upload", function (req, res) {
  if(req.isAuthenticated()){
  res.render("upload", { path: "/upload" });
  }else{
      res.redirect('/signin');
  }
});

app.get('/logout', (req, res) => {
  req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
});

app.get("/contact", (req, res) => {
  res.render("contact", { path: "/contact" });
});

app.get("/sucess", function (req, res) {
  res.render("sucess", { path: "/sucess" });
})

app.get("/sucessContact", function (req, res) {
  res.render("sucessContact", { path: "/sucessContact" });
})

app.get("/recipes", (req, res) => {
  Recipe.find()
  .then((recipes) => {
    res.render("recipes", { recipes: recipes, path: "/recipes" });
  })
  .catch((err) => {
    console.log(err);
  });
});

app.get("/recipes/:id", (req, res) => {
  Recipe.findById(req.params.id)
  .then((recipe) => {
    res.render("recipe", { recipe: recipe, path: "/recipes" });
  }).catch((err) => { 
    console.error(err); });
})


app.post('/register', async (req, res) => {
  try {
  const registerUser = await Login.register(
                  {username: req.body.username}, req.body.password
              );
  if (registerUser) {
    passport.authenticate("local") (req, res, function() {
      res.redirect("/upload");
    });
  } else {
    res.redirect("/register");
  }
} catch (err) {
  res.send(err);
}
})


app.post('/signin', async (req, res) => {
  const user = new Login({
    email: req.body.email,
    password: req.body.password
    })
    req.login(user, function(err) {
      if (err) { 
        return next(err); 
      }else{
        return passport.authenticate("local")(req, res, function() {
          res.redirect("/upload");
        });
      }
    });
})

app.post("/upload", upload.single("image"), async function (req, res) {
  try {
    const resFile = await cloudinary.uploader.upload(req.file.path, {
      public_id: req.body.title + "-" + Date.now()
    });
    console.log(resFile);
    const recipe = new Recipe({
      title: req.body.title,
      image: {
        data: req.file.filename,
        contentType: "image/png",
      },
      imageLink: resFile.secure_url,
      description: req.body.description,
      ingredients: req.body.ingredients,
      instructions: req.body.instructions,
    });
    await recipe.save();
    console.log("Recipe added");
    res.redirect('/sucess');
  } catch (err) {
    console.log(err);
  }
});

app.post('/contact', (req, res) => {
  const email = req.body.email;
  const message = req.body.formText;
  const name = req.body.name;
  const user = new User({
    name: name,
    email: email,
    message: message,
  });
  user.save().then(() => {
    console.log("User added");
  }).catch((err) => {
    console.log(err);
  })
  res.redirect('/sucessContact');
})
app.post("/sucess", (req, res) => {
  res.redirect("/");
});
app.post("/sucessContact", (req, res) => {
  res.redirect("/");
})

app.post('/recipes', (req, res) => {

})

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log("Example app listening on port 3000!");
    });
  })
  .catch((err) => {
    console.log(err);
});