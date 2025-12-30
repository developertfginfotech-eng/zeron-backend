/**
 * Investment Calculations Utility
 * Handles all investment-related calculations including:
 * - Rental yield
 * - Appreciation
 * - Withdrawal penalties
 * - Management fees
 */

/**
 * Calculate the current year of investment (1-based)
 * @param {Date} investmentDate - When the investment was made
 * @param {Date} currentDate - Current date (defaults to now)
 * @returns {number} The year number (1, 2, 3, etc.)
 */
function getCurrentInvestmentYear(investmentDate, currentDate = new Date()) {
  const millisecondsPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsPassed = (currentDate - investmentDate) / millisecondsPerYear;
  return Math.floor(yearsPassed) + 1;
}

/**
 * Calculate rental yield for a given period
 * @param {number} investmentAmount - Original investment amount
 * @param {number} rentalYieldRate - Annual rental yield percentage
 * @param {number} years - Number of years
 * @returns {object} Rental yield details
 */
function calculateRentalYield(investmentAmount, rentalYieldRate, years = 1) {
  const grossRentalYield = (investmentAmount * rentalYieldRate * years) / 100;

  return {
    grossRentalYield,
    netRentalYield: grossRentalYield
  };
}

/**
 * Calculate appreciation value
 * @param {number} investmentAmount - Original investment amount
 * @param {number} appreciationRate - Annual appreciation percentage
 * @param {number} years - Number of years
 * @returns {object} Appreciation details
 */
function calculateAppreciation(investmentAmount, appreciationRate, years) {
  // Compound appreciation: FV = PV * (1 + r)^n
  const futureValue = investmentAmount * Math.pow(1 + appreciationRate / 100, years);
  const grossAppreciation = futureValue - investmentAmount;

  return {
    futureValue,
    grossAppreciation,
    netAppreciation: grossAppreciation
  };
}

/**
 * Get withdrawal penalty based on graduated penalty structure
 * @param {Date} investmentDate - When the investment was made
 * @param {Date} withdrawalDate - When withdrawal is requested
 * @param {Date} lockInEndDate - When lock-in period ends
 * @param {Array} graduatedPenalties - Array of {year, penaltyPercentage}
 * @returns {object} Penalty details
 */
function getWithdrawalPenalty(investmentDate, withdrawalDate, lockInEndDate, graduatedPenalties = []) {
  // No penalty after lock-in period
  if (withdrawalDate >= lockInEndDate) {
    return {
      isInLockInPeriod: false,
      penaltyPercentage: 0,
      year: null
    };
  }

  // Calculate which year we're in
  const currentYear = getCurrentInvestmentYear(investmentDate, withdrawalDate);

  // Find the penalty for this year
  const penaltyTier = graduatedPenalties.find(p => p.year === currentYear);
  const penaltyPercentage = penaltyTier ? penaltyTier.penaltyPercentage : 0;

  return {
    isInLockInPeriod: true,
    penaltyPercentage,
    year: currentYear
  };
}

/**
 * Calculate total returns for an investment
 * @param {object} investment - Investment document
 * @param {object} property - Property document
 * @param {Date} currentDate - Current date (defaults to now)
 * @returns {object} Comprehensive return details
 */
function calculateInvestmentReturns(investment, property, currentDate = new Date()) {
  const investmentAmount = investment.managementFee?.netInvestment || investment.amount;
  const rentalYieldRate = investment.rentalYieldRate || property.investmentTerms?.rentalYieldRate || 8;
  const appreciationRate = investment.appreciationRate || property.investmentTerms?.appreciationRate || 3;
  const managementFeePercentage = investment.managementFee?.feePercentage || property.managementFees?.percentage || 0;

  const investmentDate = investment.investmentDate || investment.createdAt;
  const lockInEndDate = investment.lockInEndDate;
  const bondMaturityDate = investment.bondMaturityDate;

  const isInLockIn = currentDate < lockInEndDate;
  const hasMatured = currentDate >= bondMaturityDate;

  // Calculate years passed
  const yearsSinceInvestment = (currentDate - investmentDate) / (365.25 * 24 * 60 * 60 * 1000);

  // During lock-in: Only rental yield
  // After lock-in: Rental yield + Appreciation

  const rentalYield = calculateRentalYield(
    investmentAmount,
    rentalYieldRate,
    yearsSinceInvestment
  );

  let appreciation = { grossAppreciation: 0, netAppreciation: 0, futureValue: investmentAmount };

  // Appreciation only applies after lock-in period
  if (!isInLockIn) {
    const yearsAfterLockIn = (currentDate - lockInEndDate) / (365.25 * 24 * 60 * 60 * 1000);
    appreciation = calculateAppreciation(
      investmentAmount,
      appreciationRate,
      yearsAfterLockIn
    );
  }

  // Calculate management fees: percentage of total amount (principal + rental yield)
  const totalAmountForFee = investmentAmount + rentalYield.netRentalYield;
  const totalManagementFees = (totalAmountForFee * managementFeePercentage) / 100;

  const totalValue = investmentAmount + rentalYield.netRentalYield + appreciation.netAppreciation;
  const totalReturns = rentalYield.netRentalYield + appreciation.netAppreciation;

  return {
    investmentAmount,
    rentalYield,
    appreciation,
    totalValue,
    totalReturns,
    totalManagementFees,
    isInLockIn,
    hasMatured,
    yearsSinceInvestment
  };
}

/**
 * Calculate withdrawal amount with penalty if applicable
 * @param {object} investment - Investment document
 * @param {object} property - Property document
 * @param {Date} withdrawalDate - When withdrawal is requested
 * @returns {object} Withdrawal details
 */
function calculateWithdrawalAmount(investment, property, withdrawalDate = new Date()) {
  const returns = calculateInvestmentReturns(investment, property, withdrawalDate);

  const penaltyInfo = getWithdrawalPenalty(
    investment.investmentDate || investment.createdAt,
    withdrawalDate,
    investment.lockInEndDate,
    investment.graduatedPenalties || property.investmentTerms?.graduatedPenalties || []
  );

  let penaltyAmount = 0;
  if (penaltyInfo.isInLockInPeriod && penaltyInfo.penaltyPercentage > 0) {
    penaltyAmount = (returns.totalValue * penaltyInfo.penaltyPercentage) / 100;
  }

  // Management fees: percentage of principal per year (only if active)
  const managementFeePercentage = investment.managementFee?.feePercentage || property.managementFees?.percentage || 0;
  const managementFeeIsActive = property.managementFees?.isActive || false;
  const managementFeeDeductionType = property.managementFees?.deductionType || 'upfront';

  let accumulatedManagementFees = returns.totalManagementFees;

  // For upfront deduction type, fees are already deducted at investment, so don't deduct again at withdrawal
  if (managementFeeDeductionType === 'upfront') {
    accumulatedManagementFees = 0;
  }

  const netWithdrawalAmount = returns.totalValue - penaltyAmount - accumulatedManagementFees;

  return {
    ...returns,
    penalty: {
      ...penaltyInfo,
      penaltyAmount
    },
    managementFee: {
      percentage: managementFeePercentage,
      isActive: managementFeeIsActive,
      deductionType: managementFeeDeductionType,
      accumulatedAmount: accumulatedManagementFees
    },
    netWithdrawalAmount
  };
}

module.exports = {
  getCurrentInvestmentYear,
  calculateRentalYield,
  calculateAppreciation,
  getWithdrawalPenalty,
  calculateInvestmentReturns,
  calculateWithdrawalAmount
};
