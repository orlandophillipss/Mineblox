-- Bounded rings. Sort only on explicit diagnostics, never in the render loop.
local Metrics={} Metrics.__index=Metrics
function Metrics.new(capacity) return setmetatable({samples={},capacity=capacity or 2400,cursor=0},Metrics) end
function Metrics:record(seconds)
	self.cursor=self.cursor%self.capacity+1 self.samples[self.cursor]=seconds
end
function Metrics:report()
	local sorted=table.clone(self.samples) table.sort(sorted)
	if #sorted==0 then return {samples=0} end
	local total=0 for _,n in ipairs(sorted) do total+=n end
	local count=math.max(1,math.ceil(#sorted*.01)) local slow=0 for i=#sorted-count+1,#sorted do slow+=sorted[i] end
	return {samples=#sorted,meanMs=total/#sorted*1000,p50Ms=sorted[math.ceil(#sorted*.5)]*1000,p95Ms=sorted[math.ceil(#sorted*.95)]*1000,p99Ms=sorted[math.ceil(#sorted*.99)]*1000,maxMs=sorted[#sorted]*1000,averageFps=#sorted/total,low1PercentFps=count/slow}
end
return Metrics
