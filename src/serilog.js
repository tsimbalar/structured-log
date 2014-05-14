(function(){
  var parseMessageTemplate = function(messageTemplate) {
    var result = [];
    result.push({text: 'Hello, '});
    result.push({name: 'name', raw: '{name}'});
    result.push({text: '!'});
    return result;
  };

  var bindMessageTemplateProperties = function(messageTemplate, positionalArgs) {
    var result = {};

    var nextArg = 0;
    for(var i = 0; i < messageTemplate.length && nextArg < positionalArgs.length; ++i) {
      var token = messageTemplate[i];
      if (typeof token.name === 'string') {
        result[token.name] = positionalArgs[nextArg];
        nextArg++;
      }
    }

    while (nextArg < positionalArgs.length) {
      var p = positionalArgs[nextArg];
      if (typeof p !== 'undefined') {
        result['a' + nextArg] = p;
      }
      nextArg++;
    }

    return result;
  };

  var renderMessageTemplate = function(messageTemplate, properties) {
    var result = [];
    for (var i = 0; i < messageTemplate.length; ++i) {
      var token = messageTemplate[i];
      if (typeof token.name === 'string') {
        if (properties.hasOwnProperty(token.name)) {
          result.push((properties[token.name] || '').toString());
        } else {
          result.push(token.raw);
        }
      } else {
        result.push(token.text);
      }
    }
    return result.join('');
  };

  var LogEvent = function(timestamp, level, messageTemplate, properties) {
    var self = this;

    self.timestamp = timestamp;
    self.level = level;
    self.messageTemplate = messageTemplate;
    self.properties = properties;
    self.renderedMessage = function() {
      return renderMessageTemplate(messageTemplate, properties);
    };
  };

  var LevelMap = function(initial) {
    var self = this;

    var levels = {};

    if (initial !== 'OFF') {
      var sequence = ['ERROR', 'WARNING', 'INFORMATION', 'TRACE'];

      var below = false;
      for (var i = 0; i < sequence.length; ++i) {
        var level = sequence[i];
        levels[level] = !below;
        if (level === initial) {
          below = true;
        }
      }
    }

    self.isEnabled = function(level) {
      return levels[level || 'NONE'] || false;
    };
  };

  var Logger = function(levelMap, enrichers, filters, sinks) {
    var self = this;

    self.write = function(level, messageTemplate, a0, a1, a2, a3, a4, a5) {
      if (!levelMap.isEnabled(level)) {
        return;
      }

      var parsedTemplate = parseMessageTemplate(messageTemplate);
      var boundProperties = bindMessageTemplateProperties(parsedTemplate, [a0, a1, a2, a3, a4, a5]);

      var event = new LogEvent(new Date(), level, parsedTemplate, boundProperties);

      for (var i = 0; i < enrichers.length; ++i) {
        enrichers[i](event);
      }

      for (var j = 0; j < filters.length; ++j) {
        if (!(filters[j](event))) {
          return;
        }
      }

      sinks.forEach(function(sink){
        sink.emit(event);
      });
    };

    // Yes, these all need to use .apply() and arguments :)

    self.trace = function(messageTemplate, a0, a1, a2, a3, a4, a5) {
      self.write('TRACE', messageTemplate, a0, a1, a2, a3, a4, a5);
    };

    self.information = function(messageTemplate, a0, a1, a2, a3, a4, a5) {
      self.write('INFORMATION', messageTemplate, a0, a1, a2, a3, a4, a5);
    };

    self.warning = function(messageTemplate, a0, a1, a2, a3, a4, a5) {
      self.write('WARNING', messageTemplat, a0, a1, a2, a3, a4, a5);
    };

    self.error = function(messageTemplate, a0, a1, a2, a3, a4, a5) {
      self.write('ERROR', messageTemplate, a0, a1, a2, a3, a4, a5);
    };
  };

  var ConsoleSink = function() {
    var self = this;

    var write = {
      log: function() { },
      info: function() { },
      warn: function() { },
      error: function() { }
    };

    if (typeof console === 'object') {
      write.log = console.log; // function() { console.log.apply(null, arguments); }
      write.info = console.info;
      write.warn = console.warn;
      write.error = console.error;
    }

    self.emit = function(evt) {
      var formatted = evt.timestamp.toString() + ' [' + evt.level + '] ' +
        evt.renderedMessage();

      if (evt.level === 'ERROR') {
        write.error(formatted, evt.properties);
      } else if (evt.level === 'WARNING') {
        write.warn(formatted, evt.properties);
      } else if (evt.level === 'INFORMATION') {
        write.info(formatted, evt.properties);
      } else {
        write.log(formatted, evt.properties);
      }
    };
  };

  var ProcessSink = function(options) {
    var self = this;

    var write = {
      out: function() { },
      err: function() { }
    };

    if (typeof process === 'object' && typeof process.stdout === 'object') {
      write.out = function(m) { process.stdout.write(m); };
      write.err = function(m) { process.stderr.write(m); };
    }

    if (typeof options === 'object') {
      if (options.all === 'stderr') {
        write.out = write.err;
      } else if (options.all === 'stdout') {
        write.err = write.out;
      }
    }

    self.emit = function(evt) {
      var formatted = evt.timestamp.toString() + ' [' + evt.level + '] ' +
        evt.renderedMessage();

      if (evt.level === 'ERROR') {
        write.err(formatted);
      } else {
        write.out(formatted);
      }
    };
  };

  var LoggerConfiguration = function() {
    var self = this;

    var sinks = [];
    var minimumLevel = 'INFORMATION';
    var filters = [];
    var enrichers = [];

    var wireSink = function(sink, minimumLevel) {
      if (!minimumLevel) {
        return sink;
      }

      var levelMap = new LevelMap(minimumLevel);
      return {
        emit: function(evt){
          if (levelMap.isEnabled(evt.level)) {
            sink.emit(evt);
          }
        }
      };
    };

    self.writeTo = function(sinkOrEmit, minimumLevel) {
      if (typeof sinkOrEmit === 'function') {
        return self.writeTo({
          emit: sinkOrEmit
        }, minimumLevel);
      }

      var wired = wireSink(sinkOrEmit, minimumLevel);
      sinks.push(wired);
      return self;
    };

    self.minimumLevel = function(lvl) {
      minimumLevel = (lvl || 'INFORMATION').toUpperCase();
      return self;
    };

    self.enrich = function(functionOrName, valueOrNull) {
      if (typeof functionOrName === 'string') {
        return self.enrich(function(event){
          event.properties[functionOrName] = valueOrNull;
        });
      }
      enrichers.push(functionOrName);
      return self;
    };

    self.filter = function(filter) {
      filters.push(filter);
      return self;
    };

    self.createLogger = function() {
      var levelMap = new LevelMap(minimumLevel);
      return new Logger(levelMap, enrichers, filters, sinks);
    };
  };

  var Serilog = function() {
    var self = this;

    self.sink = {};

    self.sink.console = function(options) {
      return new ConsoleSink(options);
    };

    self.sink.process = function(options) {
      return new ProcessSink(options);
    };

    self.configuration = function() {
      return new LoggerConfiguration();
    };
  };

  if (typeof window === 'undefined') {
    module.exports = new Serilog();
  } else {
    window.serilog = new Serilog();
  }

}(this));