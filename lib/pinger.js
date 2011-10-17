var fs = require( 'fs' );
var path = require( 'path' );
var util = require( 'util' );
var events2 = require( 'eventemitter2' );
var inspect = require( 'sys' ).inspect;
var async = require( 'async' );


var DEFAULT_INTERVAL = 6 * 1000;
var DEFAULT_COLLECT_INTERVAL = 1; 

var Pinger = function( args )
{
  var self = this;

  this.interval = DEFAULT_INTERVAL; // interval between successive pings to each host
  this.collect_interval = DEFAULT_COLLECT_INTERVAL; // how often to have fping report
  this.pinger_path = undefined;
  this.fping = undefined;
  this.state = undefined;
  this.hosts = {};
  if( args )
  {
    if( args.interval )
      this.interval = args.interval;
    if( args.collect_interval )
      this.collect_interval = args.collect_interval;
  }
  
  events2.EventEmitter2.call( this );

};
util.inherits(Pinger, events2.EventEmitter2);

Pinger.prototype.setInterval = function( interval ) 
{
  this.interval = interval;
};

Pinger.prototype.addHost = function( host ) 
{
  if( typeof host != 'string' )
    throw new Error( 'can only add a host when its a string: ' + inspect( host ) );

  if( this.hosts[host] != undefined )
    console.log( "replacing host entry: " + host );
  this.hosts[host] = { reachable_total:0, reachable_current:0, unreachable_total: 0, unreachable_current: 0 };
  this.emit( 'host_added', host );
};

Pinger.prototype.addHosts = function( hosts )
{
  var self = this;

  if( typeof hosts != 'array' )
  {
    this.emit( 'error', 'can only addHosts if its an array' + inspect( hosts ) );
  }
  else
  {
    hosts.forEach( function( host )
    {
      self.addHost( host );
    });

    self.emit( 'hosts_added', hosts );
  }
};

Pinger.prototype.removeHost = function( host )
{
  var self = this;

  if( typeof host != 'string' )
    throw new Error( 'can only remove a host when its a string: ' + inspect( host ) );

  if( this.hosts[host] == undefined )
    return false
  else
  {
    delete this.hosts[host];
    this.emit( 'host_removed', host );
  }
};

Pinger.prototype.removeHosts = function( hosts )
{
  var self = this;
  if( typeof hosts != 'array' )
    this.emit( 'error', 'can only removeHosts if its an array: ' + inspect( hosts ) );
  else
  {
    hosts.forEach( function( host )
    {
      self.removeHost( host );
    });
    self.emit( 'hosts_removed', hosts );
  }
  
};


Pinger.prototype.start = function( pinger_path ) 
{
  var self = this;
  if( this.pinger_path == undefined )
    this.pinger_path = pinger_path;

  var spawn = require( 'child_process' ).spawn;

  var ping_args = [ '-l', '-p', this.interval, '-Q', this.collect_interval ];
  for( host in this.hosts )
  {
    ping_args.push( host );
  }

  // console.log( "fping args: " + inspect( ping_args ) );
  this.fping = spawn( self.pinger_path, ping_args );
  this.state = 'running';
  //console.log( "FPING PID = " + this.fping.pid );

  this.fping.stdout.on( 'data', function( data )
  {
    data.toString().split( '\n' ).forEach( function( line )
    {
      //console.log( "stdout: " + line );
      self.pingStdout( "" + line );
    });
  });
  this.fping.stderr.on( 'data', function( data )
  {
    data.toString().split( '\n' ).forEach( function( line )
    {
      // console.log( "stderr: " + line );
      self.pingStderr( "" + line );
    });
  });

  this.fping.on( 'exit', function( code )
  {
    self.state = 'killed';
    // console.log( self.pinger_path + " exited with " + code );
  });
};

Pinger.prototype.stop = function( cb )
{
  var self = this;

  // console.log( "STOPPING" );
  this.fping.on( 'exit', function( code )
  {
    // console.log( "FPING has exited" );
    cb( code );
  });

  this.fping.kill( 'SIGINT' );
  this.state = 'killing';
}

Pinger.prototype.restart = function()
{
  var self = this;

  if( this.pinger_path == undefined )
  {
    console.log( "Can not restart pinger before its been started" );
    return false;
  }
  else
  {
    this.stop( function( code )
    {
      // console.log( "pinger stopped with rc: " + code );
      self.start();
    });
  }
};


Pinger.prototype.kill = function()
{
  this.state = 'killing';
  // console.log( 'killing child' );
  if( this.fping != undefined )
    this.fping.kill( 'SIGINT' );
};

Pinger.prototype.pause = function()
{
  this.state = 'paused';
  // console.log( 'PAUSING' );

  this.fping.kill( 'SIGSTOP' );
};

Pinger.prototype.unpause = function()
{
  this.state = 'running';
  // console.log( 'UNPAUSING' );
  this.fping.kill( 'SIGCONT' );
};



Pinger.prototype.pingStdout = function( line )
{
  var self = this;
  // console.log( "stdout: " + line );

  var matches = undefined;
  // localhost    : xmt/rcv/%loss = 2/2/0%, min/avg/max = 0.00/0.03/0.03
  // 192.168.33.1 : xmt/rcv/%loss = 2/0/100%

  if( matches = line.match( /(\S+)\s+: \[(\d+)\], (\d+) bytes, ((\d+)\.(\d+)) ms \(((\d+)\.(\d+)) avg, (\d+)% loss\)/ ) )
  {

    var host = matches[1];
    var mo = { 
      host: host,
      state: 'alive',
      count: matches[2], 
      missed: 0,
      bytes: matches[3], 
      trip: matches[4],
      avg: matches[7],
      pct_loss: matches[10],
      reachable_current: self.hosts[host].reachable_current,
      reachable_total: self.hosts[host].reachable_total,
      unreachable_total: self.hosts[host].unreachable_total
    };

    self.hosts[host].unreachable_current=0;

    self.hosts[host].reachable_current++;
    self.hosts[host].reachable_total++;

    if( self.hosts[host].count < mo.count )
    {
      // console.log( 'previous count = ' + self.hosts[host].count + ' current = ' + mo.count );
      mo.missed = mo.count - self.hosts[host].count;
    }
    else
      mo.missed = 0;

    self.hosts[host].count = mo.count;
    self.hosts[host].count++;

    self.emit( 'ping', mo );
    // console.log( "matches: " + inspect( mo ) );
  }
  else if( matches = line.match( /(\S+)\s+: xmt\/rcv\/%loss = (\d+)\/(\d+)\/(\d+)%(.*)/ ) )
  {
    console.log( "match out: " + inspect( matches ) );
  }
};

Pinger.prototype.pingStderr = function( line )
{
  var self = this;


  var unreachable_match = undefined;
  var summary_match = undefined;
  if( unreachable_match = line.match( /^ICMP Host Unreachable from (.*)/ ) )
  {
  
    var matches = undefined;
    var mo = { };
    //ICMP Host Unreachable from 192.168.7.41 for ICMP Echo sent to host.name (ip.ip.ip.ip)
    if( matches = unreachable_match[1].match( /(\S+) for ICMP Echo sent to (\S+) \((.*)\)/ ) )
    {
      mo.host = matches[2];
      mo.host_ip = matches[3];
      mo.from = matches[1];
    }
    // ICMP Host Unreachable from 192.168.33.2 for ICMP Echo sent to ip.ip.ip.ip
    else if( matches = unreachable_match[1].match( /(\S+) for ICMP Echo sent to (\S+)/ ) )
    {
      mo.host =  matches[2];
      mo.from = matches[1];
    }

    // reset the current reachable count
    self.hosts[mo.host].reachable_current = 0;

    self.hosts[mo.host].unreachable_total++;
    self.hosts[mo.host].unreachable_current++;

    if( mo.host != undefined )
    {
      // console.log( 'unreachable' + inspect( mo ) );
      self.emit( 'unreachable', mo );
      mo.state = 'dead';
      self.emit( 'ping', mo );
    }
  }

  /* 
   * localhost : xmt/rcv/%loss = 4776/4776/0%, min/avg/max = 0.01/0.05/0.36
   * or
   * 192.168.33.1 : xmt/rcv/%loss = 2/0/100%
   */
  else if( matches = line.match( /(\S+)\s+: xmt\/rcv\/%loss = (\d+)\/(\d+)\/(\d+)(.*)/ ) )
  {
    // console.log( "match err: " + inspect( matches ) );
    var mo = {
      host:     matches[1],
      xmt:      matches[2],
      rcv:      matches[3],
      pct_loss: matches[4],
      min:      undefined,
      max:      undefined,
      avg:      undefined,
      state:    'unknown'
    };

    /*
     * when pinging remote hosts that are alive we expect to see some metrics
     */
    var other_matches = undefined;
    if( other_matches = matches[5].match( /%, min\/avg\/max = ((\d+)\.(\d+))\/((\d+)\.(\d+))\/((\d+)\.(\d+))/) )
    {
      mo.min = other_matches[1];
      mo.max = other_matches[4];
      mo.avg = other_matches[7];
      mo.state = 'alive';
    }
    else if( other_matches = matches[5].match( /^%$/ ) )
    {
      mo.state = 'dead';
    }
    else
    {
      /*
       * this would be something waiting to be parsed
       */
      console.log( "FIXME: " + inspect( matches[5] ) );
    }

    /*
     * if fping binary has been killed, then the final output is a summary of
     * all pings sent/received
     */
    if( self.state == 'killing' )
      self.emit( 'summary', mo );
    else
    {
      // otherwise its just normal ping output
      self.emit( 'ping', mo );
    }
  }


};



module.exports = Pinger;

