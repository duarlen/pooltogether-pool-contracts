const { expect } = require("chai");
const ERC20 = require('../build/ERC20Mintable.json')
const TokenFaucet = require('../build/TokenFaucet.json')
const buidler = require('@nomiclabs/buidler')
const { deployContract, deployMockContract } = require('ethereum-waffle')
const { deployments } = require("@nomiclabs/buidler")

let overrides = { gasLimit: 20000000 }

describe('TokenFaucetProxyFactory', () => {

  let wallet, wallet2

  let provider

  let comptrollerV2ProxyFactory, measure, asset

  beforeEach(async () => {
    [wallet, wallet2] = await buidler.ethers.getSigners()
    provider = buidler.ethers.provider
    measure = await deployContract(wallet, ERC20, ['Measure', 'MEAS'])
    asset = await deployContract(wallet, ERC20, ['DripToken', 'DRIP'])
    await deployments.fixture()
    let comptrollerV2ProxyFactoryResult = await deployments.get("TokenFaucetProxyFactory")
    comptrollerV2ProxyFactory = await buidler.ethers.getContractAt('TokenFaucetProxyFactory', comptrollerV2ProxyFactoryResult.address, wallet)
  })

  describe('create()', () => {
    it('should create a new comptroller', async () => {
      let tx = await comptrollerV2ProxyFactory.create(asset.address, measure.address, ethers.utils.parseEther('0.01'), overrides)
      let receipt = await provider.getTransactionReceipt(tx.hash)
      let event = comptrollerV2ProxyFactory.interface.parseLog(receipt.logs[0])
      expect(event.name).to.equal('ProxyCreated')

      let comptrollerV2 = await buidler.ethers.getContractAt("TokenFaucet", event.args.proxy, wallet)

      expect(await comptrollerV2.asset()).to.equal(asset.address)
      expect(await comptrollerV2.measure()).to.equal(measure.address)
      expect(await comptrollerV2.dripRatePerSecond()).to.equal(ethers.utils.parseEther('0.01'))
      expect(await comptrollerV2.owner()).to.equal(wallet._address)
      
    })
  })

  describe('claimAll', () => {
    it('should call claim on comptrollers', async () => {
      let comptroller = await deployMockContract(wallet, TokenFaucet.abi, overrides)
      await comptroller.mock.claim.withArgs(wallet._address).revertsWithReason("it was called!")

      await expect(comptrollerV2ProxyFactory.claimAll(wallet._address, [comptroller.address]))
        .to.be.revertedWith("it was called!")
    })
  })
})
