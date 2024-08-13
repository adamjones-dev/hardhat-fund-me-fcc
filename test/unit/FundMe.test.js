const { assert, expect } = require("chai")
const { deployments, getNamedAccounts, ethers } = require("hardhat")

describe("FundMe", async function () {
    let fundMe, deployer, mockV3Aggregator
    const sendValue = ethers.parseEther("1")

    beforeEach(async function () {
        const accounts = await ethers.getSigners()
        deployer = accounts[0]
        // deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"]) // Deploys all contracts with the "all" tag

        // Retrieve deployed contract instances
        fundMe = await ethers.getContractAt(
            "FundMe",
            (await deployments.get("FundMe")).address,
            deployer,
        )
        mockV3Aggregator = await ethers.getContractAt(
            "MockV3Aggregator",
            (await deployments.get("MockV3Aggregator")).address,
            deployer,
        )
    })

    describe("constructor", async function () {
        it("sets the aggregator addresses correctly", async function () {
            const response = await fundMe.s_priceFeed
            assert.equal(response, mockV3Aggregator.address)
        })
    })

    describe("fund", async function () {
        it("Fails if you don't send enough ETH", async function () {
            await expect(fundMe.fund()).to.be.revertedWith(
                /You need to spend more ETH/,
            )
        })
        it("updated the amount funded data structure", async function () {
            await fundMe.fund({ value: sendValue })
            const response = await fundMe.getAddressToAmountFunded(
                deployer.address,
            )
            assert.equal(response.toString(), sendValue.toString())
        })
        it("Adds funder to array of funders", async function () {
            await fundMe.fund({ value: sendValue })
            const funder = await fundMe.getFunder(0)
            assert.equal(funder, deployer.address)
        })
    })
    describe("withdraw", async function () {
        beforeEach(async function () {
            await fundMe.fund({ value: sendValue })
        })

        it("withdraw ETH from a single founder", async function () {
            const provider = ethers.provider

            // Retrieve balances, which should already be BigNumber instances
            const startingFundMeBalance = await provider.getBalance(
                fundMe.target,
            )
            const startingDeployerBalance = await provider.getBalance(
                deployer.address,
            )

            const transactionResponse = await fundMe.withdraw()
            const transactionReceipt = await transactionResponse.wait(1)

            // Use gasPrice if effectiveGasPrice is not available
            const gasPrice =
                transactionReceipt.effectiveGasPrice ||
                transactionReceipt.gasPrice
            const gasUsed = transactionReceipt.gasUsed

            // Calculate gas cost
            const gasCost = gasUsed * gasPrice // This should work since both should be BigNumbers

            // Get final balances
            const endingFundMeBalance = await provider.getBalance(fundMe.target)
            const endingDeployerBalance = await provider.getBalance(
                deployer.address,
            )

            // Assert the contract balance is zero
            assert.equal(endingFundMeBalance.toString(), "0")

            // Calculate expected deployer balance after withdrawal and gas costs
            const expectedDeployerBalance =
                startingFundMeBalance + startingDeployerBalance - gasCost

            // Assert the deployer balance is as expected
            assert.equal(
                endingDeployerBalance.toString(),
                expectedDeployerBalance.toString(),
            )
        })
        it("allows us to withdraw with multiple funders", async function () {
            const accounts = await ethers.getSigners()
            for (let i = 1; i < 6; i++) {
                const fundMeConnectedContract = await fundMe.connect(
                    accounts[i],
                )
                await fundMeConnectedContract.fund({ value: sendValue })
            }
            const provider = ethers.provider

            // Retrieve balances and convert to numbers
            const startingFundMeBalance = await provider.getBalance(
                fundMe.target,
            )
            const startingDeployerBalance = await provider.getBalance(
                deployer.address,
            )

            console.log("Starting FundMe Balance:", startingFundMeBalance)
            console.log("Starting Deployer Balance:", startingDeployerBalance)

            const transactionResponse = await fundMe.withdraw()
            const transactionReceipt = await transactionResponse.wait(1)

            // Use gasPrice if effectiveGasPrice is not available
            const gasPrice =
                transactionReceipt.effectiveGasPrice ||
                transactionReceipt.gasPrice
            const gasUsed = transactionReceipt.gasUsed

            // Convert to numbers and calculate gas cost
            const gasPriceNumber = gasPrice
            const gasUsedNumber = gasUsed
            const gasCost = gasUsedNumber * gasPriceNumber

            console.log("Gas Price:", gasPriceNumber)
            console.log("Gas Used:", gasUsedNumber)
            console.log("Gas Cost:", gasCost)

            // Get final balances and convert to numbers
            const endingFundMeBalance = await provider.getBalance(fundMe.target)
            const endingDeployerBalance = await provider.getBalance(
                deployer.address,
            )

            console.log("Ending FundMe Balance:", endingFundMeBalance)
            console.log("Ending Deployer Balance:", endingDeployerBalance)

            // Assert the contract balance is zero
            assert.equal(endingFundMeBalance, 0)

            // Calculate expected deployer balance after withdrawal and gas costs
            const expectedDeployerBalance =
                startingFundMeBalance + startingDeployerBalance - gasCost

            console.log("Expected Deployer Balance:", expectedDeployerBalance)

            // Assert the deployer balance is as expected
            assert.equal(endingDeployerBalance, expectedDeployerBalance)

            await expect(fundMe.getFunder(0)).to.be.reverted

            for (let i = 1; i < 6; i++) {
                assert.equal(
                    await fundMe.getAddressToAmountFunded(accounts[i].address),
                    0,
                )
            }
        })
        it("only allow the owner to withdraw", async function () {
            const accounts = await ethers.getSigners()
            const attackerConnected = await fundMe.connect(accounts[1])
            await expect(
                attackerConnected.withdraw(),
            ).to.be.revertedWithCustomError(fundMe, "FundMe__NotOwner")
        })
    })
})
