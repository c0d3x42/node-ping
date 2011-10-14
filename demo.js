
inspect = require( 'sys' ).inspect;

PingManager = require( './lib/index' );

var p = new PingManager();

p.start( function()
{
  var self = this;
  var pinger = this.createPinger( 1000, ['localhost', '192.168.33.1', '127.0.0.1' ] );

  var counter = 0;
  pinger.on( 'ping', function( mo )
  {
    console.log( 'host: ' + mo.host + ' is ' + mo.state );

    counter ++;
    if( counter % 5 == 0 )
    {
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
