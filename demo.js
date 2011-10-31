
var inspect = require( 'sys' ).inspect;
var async = require( 'async' );

PingManager = require( './index' ).PingManager;
var ping_manager = new PingManager();

ping_manager.start( function()
{
  var self = this;

  async.parallel(
  {
    short_lived: function( cb )
    {
      var short_pinger = self.createOnePinger( 1000, ['localhost', '192.168.33.1', '127.0.0.1' ] );
      var counter = 0;
      short_pinger.on( 'ping', function( mo )
      {
        console.log( 'host: ' + mo.host + ' is ' + mo.state );

        counter ++;
        if( counter % 5 == 0 )
        {
          setTimeout( function()
          {
            short_pinger.restart();
          }, 2000 );
        }

        if( counter > 12 )
        {
          short_pinger.stop( function()
          {
            console.log( "shorter pinger stopped" );
            cb( null, 'done' );
          });
        }
      });
      short_pinger.on( 'summary', function( mo )
      {
        console.log( "Summary: " + inspect( mo ) );
      });

      short_pinger.start();
    },
    loner_lived: function( cb ) 
    {
      var longer_pinger = self.createOnePinger( 1500, [ 'google.com', 'yahoo.com' ] );
      var counter = 0;
      longer_pinger.on( 'ping', function( mo )
      {
        console.log( 'host: ' + mo.host + ' is ' + mo.state );
        counter++;

        if( counter > 35 )
        {
          longer_pinger.stop( function()
          {
            console.log( 'longer pinger stopped' );
            cb( null, 'done' );
          });
        }
      });

      longer_pinger.start( ping_manager.fping_path );
    },
    another_pinger: function( cb ) 
    {
      var more_pingers = self.createPingers( [ 
        { name: 'zen', interval: 2000 },
        { name: 'google.com', interval: 3000 },
        { name: 'yahoo.com', interval: 3000 },
        { name: 'msn.com', interval: 3000 },
        { name: 'slashdot.com', interval: 2000 } ] );

      more_pingers.forEach( function( pinger )
      {
        var counter = 0;
        pinger.on( 'ping', function( mo )
        {
          console.log( 'host: ' + mo.host + ' is ' + mo.state );
          counter++;
          if( counter > 20 )
            pinger.stop( function() { cb( null, 'done' ); } );
        });

        pinger.start();
      });

    }
  },
  function( err, results )
  {
    console.log( "parallel pings: " + inspect( arguments ) );

  });
});
    
