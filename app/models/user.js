var db = require('../config');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');
var Link = require('./link');

var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,
  links: function() {
    return this.hasMany(Link);
  },
  initialize: function() {
    var that = this;
    bcrypt.hash(this.get('password'), null, null, function(err, hash) {
      if (err) throw err;
      that.set('password', hash);
    });
  }
});

module.exports = User;
