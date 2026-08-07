ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_monthlyLimit_positive"
CHECK ("monthlyLimit" > 0);
