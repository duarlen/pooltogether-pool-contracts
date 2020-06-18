const ethers = require('ethers')
const { Assertion } = require('chai')

Assertion.addMethod('equalish', function (value, difference = 10) {
  var obj = this._obj;

  // first, our instanceof check, shortcut
  new Assertion(obj).to.be.instanceof(ethers.utils.BigNumber);
  new Assertion(value).to.be.instanceof(ethers.utils.BigNumber);

  let delta
  if (obj.lt(value)) {
    delta = value.sub(obj)
  } else {
    delta = obj.sub(value)
  }

  this.assert(
      delta.lte(difference)
    , `expected #{this} to be within ${difference} of #{exp} but got #{act}`
    , "expected #{this} to not be within #{act}"
    , value.toString()        // expected
    , obj.toString()   // actual
  );
});