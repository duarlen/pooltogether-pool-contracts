const { expect } = require("chai");
const ComptrollerHarness = require('../build/ComptrollerHarness.json')
const IERC20 = require('../build/IERC20.json')
const buidler = require('@nomiclabs/buidler')
const { deployContract } = require('ethereum-waffle')
const { deployMockContract } = require('./helpers/deployMockContract')
const { AddressZero } = require("ethers").constants
const { call } = require('./helpers/call')

const toWei = ethers.utils.parseEther

const overrides = { gasLimit: 20000000 }

const SENTINEL = '0x0000000000000000000000000000000000000001'

async function getLastEvent(contract, tx) {
  let receipt = await buidler.ethers.provider.getTransactionReceipt(tx.hash)
  let lastLog = receipt.logs[receipt.logs.length - 1]
  return contract.interface.parseLog(lastLog)
}

describe('Comptroller', () => {

  let wallet, wallet2

  let provider
  let comptroller, comptroller2, dripToken, measure

  let prizeStrategyAddress

  beforeEach(async () => {
    [wallet, wallet2] = await buidler.ethers.getSigners()
    provider = buidler.ethers.provider

    // just fake it so that we can call it as if we *were* the prize strategy
    prizeStrategyAddress = wallet._address

    measure = await deployMockContract(wallet, IERC20.abi)
    dripToken = await deployMockContract(wallet, IERC20.abi)
    comptroller = await deployContract(wallet, ComptrollerHarness, [], overrides)
    comptroller2 = comptroller.connect(wallet2)
    await comptroller.initialize(wallet._address)
  })

  describe('initialize()', () => {
    it("should set the owner wallet", async () => {
      expect(await comptroller.owner()).to.equal(wallet._address)
    })
  })

  describe('setReserveRateMantissa()', () => {
    it('should allow the owner to set the reserve', async () => {
      await expect(comptroller.setReserveRateMantissa(toWei('0.1')))
        .to.emit(comptroller, 'ReserveRateMantissaSet')
        .withArgs(toWei('0.1'))

      expect(await comptroller.reserveRateMantissa()).to.equal(toWei('0.1'))
    })

    it('should not allow anyone else to configure the reserve rate', async () => {
      await expect(comptroller2.setReserveRateMantissa(toWei('0.2'))).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe('addBalanceDrip()', () => {
    it('should add a balance drip', async () => {
      await expect(comptroller.addBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address, toWei('0.001')))
        .to.emit(comptroller, 'BalanceDripAdded')
        .withArgs(wallet._address, measure.address, dripToken.address, toWei('0.001'))

      let drip = await comptroller.getBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address)
      expect(drip.dripRatePerSecond).to.equal(toWei('0.001'))
    })

    it('should allow only the owner to add drips', async () => {
      await expect(comptroller2.addBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address, toWei('0.001'))).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe('removeBalanceDrip()', () => {
    beforeEach(async () => {
      await comptroller.addBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address, toWei('0.001'))
    })

    it('should remove a balance drip', async () => {
      await expect(comptroller.removeBalanceDrip(prizeStrategyAddress, measure.address, SENTINEL, dripToken.address))
        .to.emit(comptroller, 'BalanceDripRemoved')
        .withArgs(wallet._address, measure.address, dripToken.address)

      let drip = await comptroller.getBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address)
      expect(drip.dripRatePerSecond).to.equal('0')
    })

    it('should allow only the owner to remove drips', async () => {
      await expect(comptroller2.removeBalanceDrip(prizeStrategyAddress, measure.address, SENTINEL, dripToken.address)).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe('setBalanceDripRate()', () => {
    beforeEach(async () => {
      await comptroller.addBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address, toWei('0.001'))
    })

    it('should allow the owner to update the drip rate', async () => {
      await expect(comptroller.setBalanceDripRate(wallet._address, measure.address, dripToken.address, toWei('0.1')))
        .to.emit(comptroller, 'BalanceDripRateSet')
        .withArgs(wallet._address, measure.address, dripToken.address, toWei('0.1'))

      let drip = await comptroller.getBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address)
      expect(drip.dripRatePerSecond).to.equal(toWei('0.1'))
    })

    it('should not allow anyone else to update the drip rate', async () => {
      await expect(comptroller2.setBalanceDripRate(wallet._address, measure.address, dripToken.address, toWei('0.1'))).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('balanceOfBalanceDrip()', () => {
    it('should return a users current balance within the balance-drip', async () => {
      await comptroller.setCurrentTime(1)
      await comptroller.addBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address, toWei('0.001'))
      await comptroller.afterDepositTo(wallet._address, toWei('10'), toWei('10'), toWei('10'), measure.address, AddressZero)
      await comptroller.setCurrentTime(11)
      // should have accrued 10 blocks worth of the drip: 10 * 0.001 = 0.01

      await measure.mock.balanceOf.withArgs(wallet._address).returns(toWei('10'))
      await measure.mock.totalSupply.returns(toWei('10'))

      expect(await call(comptroller, 'balanceOfBalanceDrip', prizeStrategyAddress, measure.address, dripToken.address, wallet._address))
        .to.equal(toWei('0.01'))
    })
  })

  describe('addVolumeDrip()', () => {
    it('should allow the owner to add a volume drip', async () => {
      let tx = comptroller.addVolumeDrip(prizeStrategyAddress, measure.address, dripToken.address, 10, toWei('100'), 10, false)

      await expect(tx)
        .to.emit(comptroller, 'VolumeDripCreated')
        .withArgs(1, dripToken.address, 10, toWei('100'))

      await expect(tx)
        .to.emit(comptroller, 'VolumeDripActivated')
        .withArgs(1, prizeStrategyAddress, measure.address, false, 0)

      await expect(tx)
        .to.emit(comptroller, 'VolumeDripPeriodStarted')
        .withArgs(1, 0, 10)

      let drip = await comptroller.getVolumeDrip(1)

      expect(drip.startTime).to.equal(10)
      expect(drip.periodSeconds).to.equal(10)
      expect(drip.dripAmount).to.equal(toWei('100'))
    })

    it('should not allow anyone else', async () => {
      await expect(comptroller2.addVolumeDrip(prizeStrategyAddress, measure.address, dripToken.address, 10, toWei('100'), 10, false)).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe('removeVolumeDrip()', () => {
    xit('should allow the owner to remove a volume drip', async () => {
      let tx = await comptroller.addVolumeDrip(prizeStrategyAddress, measure.address, dripToken.address, 10, toWei('100'), 10, false)
      let volumeDripAdded = await getLastEvent(comptroller, tx)

      await comptroller.removeVolumeDrip(prizeStrategyAddress, measure.address, volumeDripAdded.args.index)

      await expect(comptroller.getVolumeDrip(volumeDripAdded.args.index)).to.be.revertedWith("VolumeDrip/no-period")
    })

    xit('should not allow anyone else to remove', async () => {
      let tx = await comptroller.addVolumeDrip(prizeStrategyAddress, measure.address, dripToken.address, 10, toWei('100'), 10, false)
      let volumeDripAdded = await getLastEvent(comptroller, tx)

      await expect(comptroller2.removeVolumeDrip(prizeStrategyAddress, measure.address, volumeDripAdded.args.index)).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe('setVolumeDripAmount()', () => {
    it('should allow the owner to set the drip amount for a volume drip', async () => {
      let tx = await comptroller.addVolumeDrip(prizeStrategyAddress, measure.address, dripToken.address, 10, toWei('100'), 10, false)
      let volumeDripAdded = await getLastEvent(comptroller, tx)

      await comptroller.setVolumeDripAmount(volumeDripAdded.args.index, toWei('200'))

      let drip = await comptroller.getVolumeDrip(volumeDripAdded.args.index)

      expect(drip.dripAmount).to.equal(toWei('200'))
    })

    it('should not allow anyone else to set the drip amount', async () => {
      let tx = await comptroller.addVolumeDrip(prizeStrategyAddress, measure.address, dripToken.address, 10, toWei('100'), 10, false)
      let volumeDripAdded = await getLastEvent(comptroller, tx)

      await expect(comptroller2.setVolumeDripAmount(volumeDripAdded.args.index, toWei('200'))).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe('balanceOfVolumeDrip()', () => {
    it('should return a users balance of the volume drip', async () => {
      let tx = await comptroller.addVolumeDrip(prizeStrategyAddress, measure.address, dripToken.address, 10, toWei('100'), 10, false)
      let volumeDripAdded = await getLastEvent(comptroller, tx)

      // volume drip activates at 10
      await comptroller.setCurrentTime(12)
      await comptroller.afterDepositTo(wallet._address, toWei('10'), toWei('10'), toWei('10'), measure.address, AddressZero)
      // volume drip period is over
      await comptroller.setCurrentTime(22)

      expect(await call(comptroller, 'balanceOfVolumeDrip', volumeDripAdded.args.index, wallet._address)).to.equal(toWei('100'))
    })
  })

  describe('claimVolumeDrip()', () => {
    it('should allow a users volume drip to be claimed', async () => {
      let tx = await comptroller.addVolumeDrip(prizeStrategyAddress, measure.address, dripToken.address, 10, toWei('100'), 10, false)
      let volumeDripAdded = await getLastEvent(comptroller, tx)

      // volume drip activates at 10
      await comptroller.setCurrentTime(12)
      await comptroller.afterDepositTo(wallet._address, toWei('10'), toWei('10'), toWei('10'), measure.address, AddressZero)
      // volume drip period is over
      await comptroller.setCurrentTime(22)

      await dripToken.mock.transfer.withArgs(wallet._address, toWei('100')).returns(true)
      await expect(comptroller.claimVolumeDrip(volumeDripAdded.args.index, wallet._address))
        .to.emit(comptroller, 'VolumeDripClaimed')
        .withArgs(
          volumeDripAdded.args.index,
          wallet._address,
          dripToken.address,
          toWei('100')
        )
    })
  })

  describe('afterDepositTo()', () => {
    it('should update the balance drips', async () => {
      await comptroller.setCurrentTime(1)
      await comptroller.addBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address, toWei('0.001'))
      await comptroller.afterDepositTo(wallet._address, toWei('10'), toWei('10'), toWei('10'), measure.address, AddressZero)
      await comptroller.setCurrentTime(11)
      // should have accrued 10 blocks worth of the drip: 10 * 0.001 = 0.01

      await dripToken.mock.transfer.withArgs(wallet._address, toWei('0.01')).returns(true)
      await measure.mock.balanceOf.withArgs(wallet._address).returns(toWei('10'))
      await measure.mock.totalSupply.returns(toWei('10'))

      await expect(comptroller.claimBalanceDrip(prizeStrategyAddress, wallet._address, measure.address, dripToken.address))
        .to.emit(comptroller, 'BalanceDripClaimed')
        .withArgs(wallet._address, wallet._address, measure.address, dripToken.address, toWei('0.01'))
    })
  })

  describe('afterWithdrawFrom()', () => {
    it('should update the balance drips', async () => {
      await comptroller.setCurrentTime(1)
      await comptroller.addBalanceDrip(prizeStrategyAddress, measure.address, dripToken.address, toWei('0.001'))
      await comptroller.afterDepositTo(wallet._address, toWei('10'), toWei('10'), toWei('10'), measure.address, AddressZero)
      await comptroller.setCurrentTime(11)
      await comptroller.afterWithdrawFrom(wallet._address, toWei('10'), toWei('0'), toWei('0'), measure.address)

      // user should have accrued 0.01 tokens, now they should be accruing none.

      // move forward another 10 seconds
      await comptroller.setCurrentTime(21)

      // now we claim, and it should not add any more tokens
      await dripToken.mock.transfer.withArgs(wallet._address, toWei('0.01')).returns(true)
      await measure.mock.balanceOf.withArgs(wallet._address).returns(toWei('0'))
      await measure.mock.totalSupply.returns(toWei('0'))
      await expect(comptroller.claimBalanceDrip(prizeStrategyAddress, wallet._address, measure.address, dripToken.address))
        .to.emit(comptroller, 'BalanceDripClaimed')
        .withArgs(wallet._address, wallet._address, measure.address, dripToken.address, toWei('0.01'))
    })
  })
})