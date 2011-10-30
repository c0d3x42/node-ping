var fs = require( 'fs' );
var path = require( 'path' );
var util = require( 'util' );
var events2 = require( 'eventemitter2' );
var inspect = require( 'sys' ).inspect;
var async = require( 'async' );
var Pinger = require( './pinger' );

var FPING_POSSIBLE_PATHS = [ '/none/path', '/bin/ls', '/usr/bin/fping', '/usr/local/bin/fping' ];

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
      // console.log( "fping detect: " + inspect( arguments ) );
      if( result == undefined )
        self.emit( 'error', "fping not found" );
      else
      {
        //console.log( "ping path: " + result + " is GOOD" );
        self.fping_path = result;
        self.emit( 'fping_ready_at', result );
      }
    });
  }

};


PingManager.prototype._verifyBinary = function( binary_path, verified_cb )
{
  var self = this;

  //console.log( 'verifying binary path: ' + inspect( arguments ) );

  async.series( {
    check_exists: function( a_cb ) 
    { 
      // console.log( binary_path + " exists" );
      path.exists( binary_path, function( exists )
      {
        if( exists ) a_cb( null, binary_path );
        else a_cb( false );
      });
    },
    is_executable: function( cb ) 
    {
      // console.log( binary_path + " statd" );
      fs.stat( binary_path, cb );
    },
    version: function( cb )
    {
      var spawn = require( 'child_process' ).spawn;
      // console.log( 'spawning...' );
      var fping = spawn( binary_path, [ '-v' ] );
      var fping_version = undefined;

      fping.stdout.on( 'data', function( data )
      {
        // console.log( 'fping outout: ' + data );
        data.toString().split( '\n' ).forEach( function( line )
        {
          // console.log( "FPING line: " + line );
          var matches = undefined;
          /*
           * expecting something like:
           * /path/to/fping: Version 2.4b2_to $Date: 2002/01/16 00:33:42 $
           * /path/to/fping: comments to david@remote.net
           */
          if( matches = line.match( /fping: Version ((\d+).(\S+))\s(.*)/ ) )
          {
            // console.log( "fping VERSION found" );
            if( matches[2] == '2' )
            {
              // good enough for now
              fping_version = matches[1];
            }
          }
        });
      });

      fping.on( 'exit', function( code )
      {
        // console.log( 'fping version check exited with: ' + code );
        if( code != 0 )
          cb( "fping failed to run" );
        else
        {
          if( fping_version == undefined )
            cb( "Unexpected output line from fping version verification" );
          else
            cb( null, fping_version );
        }
      });
    }
  }, 
  function( err, results )
  {
    if( err )
    {
      // console.log( "ERROR: " + inspect( arguments ) );
      verified_cb( false );
    }
    else
    {
      // console.log( 'verification results: ' + inspect( results ) );
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
    pinger.addHost( host );
  });

  this.pingers[this.next_pinger] = pinger;
  this.next_pinger++;
  return pinger;
};


module.exports = PingManager;
