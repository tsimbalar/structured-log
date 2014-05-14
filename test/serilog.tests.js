var serilog = require('../src/serilog.js');

var log = serilog.configuration()
  .minimumLevel('TRACE')
  .writeTo(serilog.sink.console())
  .writeTo(serilog.sink.process({all: 'stderr'}))
  .enrich('machineName', 'BARNEY')
  .enrich(function(event){
    event.properties.isHappy = true;
  })
  .filter(function(event){
    return event.properties.isHappy;
  })
  .createLogger();

log.information('Hello, {name}!', 'world');