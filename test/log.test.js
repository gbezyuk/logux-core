var createTestTimer = require('../create-test-timer')
var MemoryStore = require('../memory-store')
var Log = require('../log')

function createLog () {
  return new Log({ timer: createTestTimer(), store: new MemoryStore() })
}

function checkEvents (log, expected) {
  var events = log.store.created.map(function (entry) {
    return entry[0]
  })
  expect(events).toEqual(expected)
}

function checkEntries (log, expected) {
  expect(log.store.created).toEqual(expected)
}

function logWith (events) {
  var log = createLog()
  return Promise.all(events.map(function (event) {
    if (event.length) {
      return log.add(event[0], event[1])
    } else {
      return log.add(event)
    }
  })).then(function () {
    return log
  })
}

it('requires timer', function () {
  expect(function () {
    new Log()
  }).toThrowError(/log timer/)
})

it('requires store', function () {
  expect(function () {
    new Log({ timer: createTestTimer() })
  }).toThrowError(/log store/)
})

it('requires type for events', function () {
  var log = createLog()
  expect(function () {
    log.add({ a: 1 })
  }).toThrowError(/type/)
})

it('sends new events to listeners', function () {
  var log = createLog()
  var events1 = []
  var events2 = []

  return log.add({ type: 'a' }).then(function () {
    log.on('event', function (event, meta) {
      expect(typeof meta).toEqual('object')
      events1.push(event)
    })

    log.on('event', function (event) {
      events2.push(event)
    })

    expect(events1).toEqual([])
    expect(events2).toEqual([])

    return log.add({ type: 'b' })
  }).then(function () {
    return log.add({ type: 'c' })
  }).then(function () {
    expect(events1).toEqual([{ type: 'b' }, { type: 'c' }])
    expect(events2).toEqual(events1)
  })
})

it('supports one-time listeners', function () {
  var log = createLog()

  var events = []
  log.once('event', function (event) {
    events.push(event)
  })

  return log.add({ type: 'b' }).then(function () {
    return log.add({ type: 'c' })
  }).then(function () {
    expect(events).toEqual([{ type: 'b' }])
  })
})

it('unsubscribes listeners', function () {
  var log = createLog()

  var events = []
  var unsubscribe = log.on('event', function (event) {
    events.push(event)
  })

  return log.add({ type: 'a' }).then(function () {
    unsubscribe()
    return log.add({ type: 'b' })
  }).then(function () {
    expect(events).toEqual([{ type: 'a' }])
  })
})

it('ignore existed created time', function () {
  var log = createLog()

  var added = []
  log.on('event', function (event) {
    added.push(event)
  })

  return log.add({ type: 'a' }, { created: [0] }).then(function (result1) {
    expect(result1).toBeTruthy()
    return log.add({ type: 'b' }, { created: [0] })
  }).then(function (result2) {
    expect(result2).toBeFalsy()
    checkEvents(log, [{ type: 'a' }])
    expect(added).toEqual([{ type: 'a' }])
  })
})

it('iterates through added events', function () {
  return logWith([
    [{ type: 'a' }, { created: [3] }],
    [{ type: 'b' }, { created: [2] }],
    [{ type: 'c' }, { created: [1] }]
  ]).then(function (log) {
    var entries = []
    return log.each(function (event, meta) {
      entries.push([event, meta])
    }).then(function () {
      expect(entries).toEqual([
        [{ type: 'a' }, { created: [3], added: 1 }],
        [{ type: 'b' }, { created: [2], added: 2 }],
        [{ type: 'c' }, { created: [1], added: 3 }]
      ])
    })
  })
})

it('iterates by added order', function () {
  return logWith([
    [{ type: 'a' }, { created: [3] }],
    [{ type: 'b' }, { created: [2] }],
    [{ type: 'c' }, { created: [1] }]
  ]).then(function (log) {
    var events = []
    return log.each({ order: 'added' }, function (event) {
      events.push(event)
    }).then(function () {
      expect(events).toEqual([
        { type: 'c' },
        { type: 'b' },
        { type: 'a' }
      ])
    })
  })
})

it('disables iteration on false', function () {
  return logWith([
    { type: 'a' },
    { type: 'b' }
  ]).then(function (log) {
    var events = []
    return log.each(function (event) {
      events.push(event)
      return false
    }).then(function () {
      expect(events).toEqual([{ type: 'b' }])
    })
  })
})

it('supports multi-pages stores', function () {
  var store = {
    get: function () {
      return Promise.resolve({
        entries: [['a', 'a']],
        next: function () {
          return Promise.resolve({ entries: [['b', 'b']] })
        }
      })
    }
  }
  var log = new Log({ timer: createTestTimer(), store: store })

  var events = []
  return log.each(function (event) {
    events.push(event)
  }).then(function () {
    expect(events).toEqual(['a', 'b'])
  })
})

it('keeps existed time', function () {
  return logWith([
    [{ type: 'timed' }, { created: [100] }]
  ]).then(function (log) {
    checkEntries(log, [
      [{ type: 'timed' }, { created: [100], added: 1 }]
    ])
  })
})

it('sets time for timeless events', function () {
  return logWith([
    [{ type: 'timeless' }]
  ]).then(function (log) {
    checkEntries(log, [
      [{ type: 'timeless' }, { created: [1], added: 1 }]
    ])
  })
})

it('cleans events', function () {
  return logWith([
    { type: 'a' }
  ]).then(function (log) {
    return log.clean().then(function () {
      checkEntries(log, [])
    })
  })
})

it('keeps events from cleaning', function () {
  return logWith([
    { type: 'a' },
    { type: 'b' }
  ]).then(function (log) {
    log.keep(function (event) {
      return event.type === 'b'
    })
    return log.clean().then(function () {
      checkEvents(log, [{ type: 'b' }])
    })
  })
})

it('removes keeper', function () {
  return logWith([
    { type: 'a' },
    { type: 'b' }
  ]).then(function (log) {
    var unkeep = log.keep(function (event) {
      return event.type === 'b'
    })
    return log.clean().then(function () {
      checkEvents(log, [{ type: 'b' }])
      unkeep()
      return log.clean().then(function () {
        checkEvents(log, [])
      })
    })
  })
})

it('does not fall on multiple unkeep call', function () {
  var log = createLog()
  var unkeep = log.keep(function () { })
  unkeep()
  unkeep()
})
