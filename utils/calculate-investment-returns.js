/**
 * Calculate investment returns based on holding period
 * Used for displaying real-time returns on dashboard
 *
 * NOTE: This function calculates UNREALIZED returns (what the investment is worth now)
 * It applies management fees to the returns, not the principal
 */

function calculateInvestmentReturns(investment) {
  const now = new Date();
  const investmentDate = new Date(investment.createdAt);
  const maturityDate = investment.maturityDate ? new Date(investment.maturityDate) : null;

  // Get principal amount (user's actual investment)
  const principalAmount = investment.managementFee?.netInvestment || investment.amount;

  // Get management fee percentage (from investment or property settings)
  const managementFeePercentage = investment.managementFee?.feePercentage || 0;

  // Calculate holding period in milliseconds
  const holdingPeriodMs = now - investmentDate;

  // ==================== TEST MODE (REMOVE BEFORE PRODUCTION) ====================
  // Accelerated time: 1 hour = 1 year
  // Don't calculate returns until at least 1 hour (1 year) has passed
  const ONE_HOUR_MS = 60 * 60 * 1000;
  if (holdingPeriodMs < ONE_HOUR_MS) {
    // Investment is less than 1 hour old - no returns yet
    return {
      principalAmount,
      holdingPeriodYears: 0,
      rentalYieldEarned: 0,
      appreciationGain: 0,
      currentValue: principalAmount,
      withdrawalValue: principalAmount,
      totalReturns: 0,
      isAfterMaturity: false,
      maturityDate: maturityDate ? maturityDate.toISOString() : null
    };
  }

  const holdingPeriodYears = holdingPeriodMs / (60 * 60 * 1000); // 1 hour = 1 year

  // Real time calculation (uncomment for production):
  // const holdingPeriodYears = holdingPeriodMs / (365 * 24 * 60 * 60 * 1000);
  // ==================== END TEST MODE ====================
  const rentalYieldRate = investment.rentalYieldRate || 0;
  const appreciationRate = investment.appreciationRate || 0;
  const penaltyRate = investment.penaltyRate || 0;
  const maturityPeriodYears = investment.maturityPeriodYears || 5;

  // Check if investment has reached maturity
  const isAfterMaturity = maturityDate && now >= maturityDate;

  // Calculate rental yield (earned throughout holding period, capped at maturity period)
  const annualRentalIncome = principalAmount * (rentalYieldRate / 100);
  const grossRentalYield = annualRentalIncome * Math.min(holdingPeriodYears, maturityPeriodYears);

  // Apply management fee to rental yield
  const rentalManagementFee = (grossRentalYield * managementFeePercentage) / 100;
  const rentalYieldEarned = grossRentalYield - rentalManagementFee;

  // Calculate appreciation (only after maturity)
  let appreciationGain = 0;
  let appreciationManagementFee = 0;
  if (isAfterMaturity) {
    const yearsAfterMaturity = Math.max(0, holdingPeriodYears - maturityPeriodYears);
    if (yearsAfterMaturity > 0) {
      const appreciatedValue = principalAmount * Math.pow(1 + appreciationRate / 100, yearsAfterMaturity);
      const grossAppreciation = appreciatedValue - principalAmount;

      // Apply management fee to appreciation
      appreciationManagementFee = (grossAppreciation * managementFeePercentage) / 100;
      appreciationGain = grossAppreciation - appreciationManagementFee;
    }
  }

  // Calculate current value for display (without penalty)
  // Penalty is only applied during actual withdrawal, not for display purposes
  const currentValue = principalAmount + rentalYieldEarned + appreciationGain;

  // Track total management fees deducted
  const totalManagementFees = rentalManagementFee + appreciationManagementFee;

  // Calculate withdrawal value (what user would get if withdrawn now)
  let withdrawalValue;
  if (isAfterMaturity) {
    // After maturity: no penalty
    withdrawalValue = principalAmount + rentalYieldEarned + appreciationGain;
  } else {
    // Before maturity: apply early withdrawal penalty
    const penalty = principalAmount * (penaltyRate / 100);
    withdrawalValue = principalAmount + rentalYieldEarned - penalty;
  }

  // Total returns (unrealized) - based on current value without penalty
  const totalReturns = currentValue - principalAmount;

  return {
    principalAmount,
    holdingPeriodYears: parseFloat(holdingPeriodYears.toFixed(2)),
    rentalYieldEarned: parseFloat(rentalYieldEarned.toFixed(2)),
    grossRentalYield: parseFloat(grossRentalYield.toFixed(2)),
    rentalManagementFee: parseFloat(rentalManagementFee.toFixed(2)),
    appreciationGain: parseFloat(appreciationGain.toFixed(2)),
    appreciationManagementFee: parseFloat(appreciationManagementFee.toFixed(2)),
    currentValue: parseFloat(currentValue.toFixed(2)),
    withdrawalValue: parseFloat(withdrawalValue.toFixed(2)),
    totalReturns: parseFloat(totalReturns.toFixed(2)),
    totalManagementFees: parseFloat(totalManagementFees.toFixed(2)),
    managementFeePercentage,
    isAfterMaturity,
    maturityDate: maturityDate ? maturityDate.toISOString() : null
  };
}

module.exports = { calculateInvestmentReturns };
