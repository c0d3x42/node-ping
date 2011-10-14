var fs = require( 'fs' );
var path = require( 'path' );
var util = require( 'util' );
var events2 = require( 'eventemitter2' );
var inspect = require( 'sys' ).inspect;
var async = require( 'async' );
var Pinger = require( './pinger' );

var FPING_POSSIBLE_PATHS = [ '/usr/bin/fping', '/usr/local/bin/fping' ];

var PingManager = function( args )
{
  var self = this;

  events2.EventEmitter2.call( this );

  this.fping_path = undefined;

  this.pingers = {};
  this.next_pinger = 0;

  if( args != undefined )
  {
    this.fping_path = args.fping_path || undefined;
  }

  this._check();
};
util.inherits(PingManager, events2.EventEmitter2);


PingManager.prototype._check_paths = function()
{
  var self = this;

  if( this.fping_path == undefined )
  {
    async.detectSeries( FPING_POSSIBLE_PATHS, self._verifyBinary, function( result )
    {
      if( result == undefined )
        self.emit( 'error', "fping not found" );
      else
      {
        console.log( "ping path: " + result + " is GOOD" );
        self.fping_path = result;
        self.emit( 'fping_ready_at', result );
      }
    });
  }

};


PingManager.prototype._verifyBinary = function( binary_path, verified_cb )
{
  var self = this;

  console.log( 'verifying binary path: ' + inspect( arguments ) );

  async.series( {
    check_exists: function( a_cb ) 
    { 
      console.log( binary_path + " exists" );
      if( path.existsSync( binary_path ) )
        a_cb( null, binary_path );
      else
        a_cb( false );
    },
    is_executable: function( cb ) 
    {
      console.log( binary_path + " statd" );
      fs.stat( binary_path, cb );
    },
    version: function( cb )
    {
      var spawn = require( 'child_process' ).spawn;
      console.log( 'spawning...' );
      var fping = spawn( binary_path, [ '-v' ] );
      fping.stdout.on( 'data', function( data )
      {
        console.log( 'fping outout: ' + data );
        cb( null );
      });

      fping.on( 'exit', function( code )
      {
        console.log( 'fping version check exited with: ' + code );
      });
    }
  }, 
  function( err, results )
  {
    if( err )
    {
      console.log( "ERROR: " + inspect( arguments ) );
      verified_cb( null );
    }
    else
    {
      console.log( 'verification results: ' + inspect( results ) );
      verified_cb( true, binary_path );
    }
  });

};

PingManager.prototype._check = function()
{
  var self = this;

  this._check_paths();
};

PingManager.prototype.start = function( cb ) 
{
  var self = this;

  this.on( 'fping_ready_at', cb );
};

PingManager.prototype.stop = function( stopped_cb )
{
  var self = this;

  async.forEach( self.pingers, function( pinger, cb )
  {
    pinger.stop( function( rc )
    {
      cb( null );
    });
  },
  function( err )
  {
    stopped_cb();
  });
};

PingManager.prototype.createPinger = function( interval, hosts )
{
  var self = this;
  var pinger = new Pinger( { interval: interval } );
  hosts.forEach( function( host )
  {
    pinger.addhost( host );
  });

  this.pingers[this.next_pinger] = pinger;
  this.next_pinger++;
  return pinger;
};

var p = new PingManager();
console.log( 'p=' + inspect( p ) );

p.start( function()
{
  var self = this;
  console.log( "started: " + inspect( this ) );

  //var pinger = this.createPinger( 1000, ['localhost', 'xer0', 'zer0' ] );
  var pinger = this.createPinger( 1000, ['localhost', 'www.ofsted.gov.uk', '192.168.33.1' ] );

  var counter = 0;
  pinger.on( 'ping', function( mo )
  {

    console.log( 'host: ' + mo.host + ' is ' + mo.state );

    counter ++;
    if( counter % 5 == 0 )
    {
      //counter = 0;
      //pinger.kill();
      setTimeout( function()
      {
        pinger.restart( p.fping_path );
      }, 2000 );
    }

    if( counter > 12 )
    {
      pinger.stop( function()
      {
        console.log( "shutting down" );
        process.exit( 0 );
      });
    }
  });
  pinger.start( p.fping_path );
  
});
