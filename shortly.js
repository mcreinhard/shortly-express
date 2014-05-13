var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bcrypt = require('bcrypt-nodejs');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(partials());
  app.use(express.bodyParser())
  app.use(express.static(__dirname + '/public'));
  // include express.cookies and express.sessions
  app.use(express.cookieParser());
  app.use(express.session({secret: 'insert something super secret'}));
});

var checkUser = function(req, res, next) {
  // check if the user if logged in
  if (req.session.user) {
    next();
  } else {
    // if not, redirect to login page
    res.redirect('/login');
  }
};

// todo: max session length?

// routes that require authentication
app.all('/', checkUser);
app.all('/create', checkUser);
app.all('/links', checkUser);


app.get('/', function(req, res) {
  res.render('index');
});

app.get('/create', function(req, res) {
  res.render('index');
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

// filter links to only links that correspond with the session user
app.get('/links', function(req, res) {
  Links.reset().query(function(qb) {
    qb.join('users', 'urls.user_id', '=', 'users.id')
    .where('users.username', req.session.user);
  })
  .fetch().then(function(links) {
    res.send(200, links.models);
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.post('/signup', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  // check if valid username (see if it's already taken)
  db.knex('users')
    .where({username: username})
    .select()
    .then(function(results) {
      if (results.length > 0) {
        console.log('Username ' + username + ' is already taken');
        return res.send(400, 'Username ' + username + ' is already taken');
      }
      // new User - create new user, hash password?
      var user = new User({
        username: username,
        password: password // to be encrypted
      });
      // save the new user
      user.save().then(function(newUser) {
        Users.add(newUser);
        // redirect to main page as logged in user
        res.redirect('/login');
      });
    });
});

app.post('/login', function(req, res) {
  // get login credentials
  var username = req.body.username;
  var password = req.body.password;
  var hash = db.knex('users') // retrieve hashed password from db
    .where({username: username})
    .select('password')
    .then( function(hash) {
      hash = hash[0].password;
      bcrypt.compare(password, hash, function(err, result) {
        if (err) { throw err; }
        if (result) {
          req.session.regenerate(function(){ // generate new session on login success
            req.session.user = username;
            res.redirect('/');
          });
        } else {
          res.redirect('/login'); // else respawn login page with error message
        }
      });
    });
});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        db.knex('users').where({username: req.session.user}).select('id')
        .then (function(results) {
          var link = new Link({
            url: uri,
            title: title,
            base_url: req.headers.origin,
            user_id: results[0].id
          });

          link.save().then(function(newLink) {
            Links.add(newLink);
            res.send(200, newLink);
          });
        });
      });
    }
  });
});




/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
