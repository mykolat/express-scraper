var http = require('http');
var path = require('path');

var async = require('async');

var express = require('express');

var router = express();
var server = http.createServer(router);

var flatfile = require('flat-file-db');
var db = flatfile('tmp/my.db');

var request = require('request');
var fs = require('fs');
var forEachAsync = require('forEachAsync').forEachAsync

// router.use(express.static(path.resolve(__dirname, 'client')));

var CronJob = require('cron').CronJob;

var job = new CronJob({
  cronTime: '00 00 06 * * *',
  onTick: () => { getDomainsList().then(checkDomains) },
  start: true,
  timeZone: 'Israel'
});

console.log('job status', job.running);

router.get('/domains', function(req, res) {
  let domains = getDomainsState()
    .then(domains =>
      res.send(domains, {
        'Content-Type': 'text/plain'
      }, 201))

});

router.get('/domains/refresh', function(req, res) {
  getDomainsList()
    .then((list) => checkDomains(list)
      .then(() => {
        getDomainsState()
          .then((domains) =>
            res.json(domains, 200))
      }),
      error => res.send(500)
    );
});



router.get('/domains/add', function(req, res) {
  addDomain(req.query.domain).then(
    result => res.send(200),
    error => res.send(500)
  );
});



function getDomainsList() {
  return new Promise((resolve, reject) => {
    fs.readFile('target_domains.txt', 'utf8', function(err, buffer) {
      var list = buffer.split("\n");
      resolve(list)
    });
  })
}

function getDomainsState() {
  return new Promise((resolve, reject) => {
    // getDomainsList().then((domains) => {
    let response = { keys: [] }

    db.keys().forEach((el) => {
      let match = el.match(/\[(.*?)\]/);
      if (match) {
        response[match[1]] = db.get(el);
      }
      else {
        response.keys.push({ domain: el, exist: db.get(el) })
      }
    });
    resolve(response)
    // })
  })
}

function addDomain(domain) {
  let promise = new Promise((resolve, reject) => {
    fs.appendFile('target_domains.txt', "\n" + domain, function(err) {
      if (err) throw err;
      console.log('Saved!');
      resolve()
    });
  });
  return promise;

}

function checkDomains(domains) {
  return forEachAsync(domains, function(next, domain, index, array) {
    console.log("[log] Procesing domain", domain, new Date)

    request.get(domain + "/ads.txt", { timeout: 2000 }, (error, response, body) => {
      console.log(error)
      if (error) {
        db.put(domain, { exist: false })
      }
      else if (response && response.statusCode) {
        db.put(domain, { exist: response.statusCode })
      }

      next()
    });
  }).then(() => {
    db.put("[status] updated at", { time:new Date() })
  })
}


server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function() {
  var addr = server.address();
  console.log("Chat server listening at", addr.address + ":" + addr.port);
});
